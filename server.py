#!/usr/bin/env python3
"""Servidor local (sem dependencias externas) que expoe o estado ao vivo
das sessoes do Claude Code rodando nesta maquina, lendo diretamente de
~/.claude/sessions/*.json e ~/.claude/teams/*/config.json.

Uso:
    python3 server.py [porta]

Depois abra http://localhost:<porta> no navegador.
"""
import base64
import hashlib
import json
import fcntl
import os
import pty
import re
import signal
import struct
import subprocess
import termios
import threading
import time
import urllib.parse
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

CLAUDE_DIR = Path.home() / ".claude"
SESSIONS_DIR = CLAUDE_DIR / "sessions"
TEAMS_DIR = CLAUDE_DIR / "teams"
PROJECTS_DIR = CLAUDE_DIR / "projects"
STATIC_DIR = Path(__file__).parent / "static"

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_SCROLLBACK = 300_000  # bytes de buffer mantidos por agente

# id -> {pid, master_fd, cwd, name, proc, buffer, buf_lock, writers, writers_lock, closed}
AGENTS = {}
AGENTS_LOCK = threading.Lock()


OSC_TITLE_RE = re.compile(rb"\x1b\](?:0|1|2);(.*?)(?:\x07|\x1b\\)")


def _extract_osc_title(chunk):
    """Extrai o ultimo titulo definido via sequencia OSC (\\x1b]0;...\\x07) num
    pedaco de bytes — o mesmo mecanismo que qualquer terminal usa pra mostrar um
    titulo de aba/janela descritivo (o `claude` real manda isso conforme
    trabalha). Melhor esforco: nao trata sequencia partida entre dois reads."""
    matches = OSC_TITLE_RE.findall(chunk)
    if not matches:
        return None
    try:
        return matches[-1].decode("utf-8", "ignore").strip() or None
    except Exception:
        return None


def _agent_reader_loop(agent_id, master_fd):
    """Roda para sempre (enquanto o processo existir), independente de haver
    algum navegador conectado. Drena o master_fd (senão o processo trava ao
    encher o buffer do kernel) e alimenta o buffer de scrollback + qualquer
    WebSocket conectado no momento."""
    while True:
        try:
            chunk = os.read(master_fd, 4096)
        except OSError:
            chunk = b""
        with AGENTS_LOCK:
            info = AGENTS.get(agent_id)
        if info is None:
            return
        if not chunk:
            with info["buf_lock"]:
                info["closed"] = True
            with info["writers_lock"]:
                writers = list(info["writers"])
            for w in writers:
                try:
                    w(b"", closed=True)
                except Exception:
                    pass
            try:
                os.close(master_fd)
            except OSError:
                pass
            with AGENTS_LOCK:
                if AGENTS.get(agent_id, {}).get("master_fd") == master_fd:
                    AGENTS.pop(agent_id, None)
            return
        with info["buf_lock"]:
            info["buffer"] += chunk
            if len(info["buffer"]) > MAX_SCROLLBACK:
                del info["buffer"][: len(info["buffer"]) - MAX_SCROLLBACK]
        if not info.get("nameIsCustom"):
            title = _extract_osc_title(chunk)
            if title:
                with AGENTS_LOCK:
                    cur = AGENTS.get(agent_id)
                    if cur is not None:
                        cur["name"] = title
        with info["writers_lock"]:
            writers = list(info["writers"])
        for w in writers:
            try:
                w(chunk, closed=False)
            except Exception:
                with info["writers_lock"]:
                    if w in info["writers"]:
                        info["writers"].remove(w)


def spawn_agent(cwd, name, resume_session_id=None, parent_session_id=None, llm_bin=None):
    """Cria o PTY e registra o agente, mas NAO inicia o processo real ainda —
    isso so acontece em `_start_agent_process`, chamado quando o primeiro resize
    de verdade chega pelo WebSocket (ver `_handle_terminal_ws`). Sem isso, o
    `claude` comecava a desenhar a tela inicial (as vezes despejando um
    historico inteiro, no caso do --resume) assumindo um tamanho de terminal
    estimado/errado, e esse conteudo ja impresso nao se ajusta sozinho depois —
    ficava com rodape cortado, espaco em branco sobrando, etc."""
    cwd = cwd or str(Path.home())
    cwd_path = Path(cwd).expanduser()
    if not cwd_path.is_dir():
        raise ValueError(f"diretório não existe: {cwd}")

    master_fd, slave_fd = pty.openpty()
    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 140, 0, 0))
    if resume_session_id:
        # continua a MESMA conversa (sessionId) de uma sessao externa, via `claude --resume`.
        # so eh seguro se a sessao original nao estiver sendo usada ao mesmo tempo no terminal
        # dela (dois processos escrevendo no mesmo transcript ao mesmo tempo pode conflitar).
        cmd = ["claude", "--resume", resume_session_id]
    else:
        # "novo agente" precisa ser um agente de verdade rodando na pasta escolhida,
        # nao so um shell vazio esperando o usuario digitar o CLI na mao. So aceita
        # um binario da lista conhecida (KNOWN_LLM_CLIS) ou "claude" — nunca um
        # binario arbitrario vindo direto da API, pra nao virar um "rode qualquer
        # coisa" a partir do body do POST.
        known_bins = {c["bin"] for c in KNOWN_LLM_CLIS} | {"claude"}
        cmd = [llm_bin if llm_bin in known_bins else "claude"]

    agent_id = uuid.uuid4().hex[:12]
    with AGENTS_LOCK:
        AGENTS[agent_id] = {
            "id": agent_id,
            "pid": None,
            "master_fd": master_fd,
            "slave_fd": slave_fd,
            "cmd": cmd,
            "cwd": str(cwd_path),
            "name": name or f"agent-{agent_id[:6]}",
            "nameIsCustom": bool(name),
            "startedAt": int(time.time() * 1000),
            "parentSessionId": parent_session_id,
            "proc": None,
            "started": False,
            "buffer": bytearray(),
            "buf_lock": threading.Lock(),
            "writers": [],
            "writers_lock": threading.Lock(),
            "closed": False,
            "kind": "agent",
            "llm": cmd[0],
        }
    return agent_id


def spawn_install(cli_id, command):
    """Roda um comando de instalacao de verdade (ex: `npm install -g codex`)
    num PTY de verdade, reaproveitando exatamente o mesmo mecanismo de
    spawn_agent — o frontend conecta no mesmo /ws/agent/<id> e ve o log ao
    vivo, igual um agente normal, so que com kind="install" pra NAO aparecer
    na arvore de sessoes (read_app_agent_sessions filtra isso)."""
    master_fd, slave_fd = pty.openpty()
    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 140, 0, 0))
    agent_id = uuid.uuid4().hex[:12]
    with AGENTS_LOCK:
        AGENTS[agent_id] = {
            "id": agent_id,
            "pid": None,
            "master_fd": master_fd,
            "slave_fd": slave_fd,
            "cmd": ["bash", "-lc", command],
            "cwd": str(Path.home()),
            "name": f"instalar {cli_id}",
            "nameIsCustom": True,
            "startedAt": int(time.time() * 1000),
            "parentSessionId": None,
            "proc": None,
            "started": False,
            "buffer": bytearray(),
            "buf_lock": threading.Lock(),
            "writers": [],
            "writers_lock": threading.Lock(),
            "closed": False,
            "kind": "install",
        }
    return agent_id


def _start_agent_process(agent_id):
    """Inicia de fato o processo do agente, ja com o tamanho de terminal correto
    aplicado. So roda uma vez por agente (idempotente)."""
    with AGENTS_LOCK:
        info = AGENTS.get(agent_id)
        if not info or info["started"]:
            return
        info["started"] = True
        master_fd = info["master_fd"]
        slave_fd = info["slave_fd"]
        cmd = info["cmd"]
        cwd = info["cwd"]

    # este backend roda DENTRO de uma sessao do Claude Code (foi o proprio Claude
    # que o lancou), entao o os.environ daqui carrega variaveis como
    # CLAUDE_CODE_CHILD_SESSION / CLAUDE_CODE_MESSAGING_SOCKET / CLAUDE_CODE_MESSAGING_TOKEN
    # que amarram um processo `claude` a essa sessao PAI como se ele fosse um
    # subagente dela — herdando isso, o agente "novo" que o usuario abre pelo
    # app se comporta como um subagente efemero (a propria CLI reporta
    # "inherited CLAUDE_CODE_CHILD_SESSION marker" e o processo finaliza
    # sozinho ao terminar a tarefa, em vez de ficar interativo). Cada agente
    # do app tem que nascer como sessao TOPO independente, entao essas
    # variaveis sao removidas antes de iniciar o processo real.
    clean_env = {k: v for k, v in os.environ.items() if not k.startswith(("CLAUDE_CODE_", "CLAUDECODE", "CLAUDE_PID", "CLAUDE_EFFORT"))}
    env = dict(
        clean_env,
        TERM="xterm-256color",
        COLORTERM="truecolor",  # sem isso, algumas CLIs (inclusive o claude) caem pra uma paleta
        FORCE_COLOR="3",         # de cores mais pobre/diferente do terminal real, "parece outro tema"
    )
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        env=env,
        preexec_fn=os.setsid,
        close_fds=True,
    )
    os.close(slave_fd)

    with AGENTS_LOCK:
        info["pid"] = proc.pid
        info["proc"] = proc
    threading.Thread(target=_agent_reader_loop, args=(agent_id, master_fd), daemon=True).start()


def stop_agent(agent_id):
    with AGENTS_LOCK:
        info = AGENTS.get(agent_id)
        if info is not None and info["pid"] is None:
            # processo nunca chegou a comecar (parado antes do 1o resize real) - so
            # fecha os fds do PTY, nao ha processo pra matar.
            AGENTS.pop(agent_id, None)
    if not info:
        return False
    pid = info["pid"]
    if pid is None:
        try:
            os.close(info["master_fd"])
        except OSError:
            pass
        try:
            os.close(info["slave_fd"])
        except OSError:
            pass
        return True
    try:
        pgid = os.getpgid(pid)
    except ProcessLookupError:
        pgid = None
    if pgid is not None:
        # algumas CLIs (ex: copilot) so gravam a sessao como "encerrada
        # normalmente" quando recebem SIGINT (equivalente a Ctrl+C no
        # terminal) — um SIGTERM direto pula esse fluxo e a proxima vez que
        # abre, a CLI acha que foi interrompida a forca e oferece "restaurar
        # sessao". Por isso tenta SIGINT primeiro, so escala pra
        # SIGTERM/SIGKILL se nao encerrar sozinha a tempo.
        try:
            os.killpg(pgid, signal.SIGINT)
        except ProcessLookupError:
            pgid = None
        else:
            for _ in range(15):
                if info["proc"].poll() is not None:
                    break
                time.sleep(0.1)
            else:
                try:
                    os.killpg(pgid, signal.SIGTERM)
                except ProcessLookupError:
                    pgid = None
                else:
                    for _ in range(20):
                        if info["proc"].poll() is not None:
                            break
                        time.sleep(0.1)
                    else:
                        try:
                            os.killpg(pgid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
    # o _agent_reader_loop detecta o EOF do master_fd e faz a limpeza (fecha fd, remove do registro)
    return True


def app_agent_by_pid(pid):
    with AGENTS_LOCK:
        for info in AGENTS.values():
            if info["pid"] == pid:
                return info
    return None


def read_app_agent_sessions():
    """Agentes iniciados pelo proprio app (botao '+ novo agente') rodam um shell
    de verdade ($SHELL -i), nao o binario `claude` — por isso NUNCA aparecem em
    ~/.claude/sessions/*.json (so o CLI do claude escreve esse arquivo). Sem isso
    eles ficariam invisiveis no dashboard mesmo estando vivos e respondendo."""
    sessions = []
    with AGENTS_LOCK:
        items = list(AGENTS.values())
    for info in items:
        if info.get("kind") == "install":
            continue  # instalador de LLM CLI (ver spawn_install) — nao e uma sessao de conversa
        pid = info["pid"]
        if pid is None:
            # ainda nao comecou de verdade (esperando o 1o resize) - usa um
            # pid sintetico so pra exibicao, nao colide com pid real (>0)
            pid = -(int(hashlib.sha1(info["id"].encode()).hexdigest(), 16) % 2_000_000_000 + 1)
        sessions.append({
            "pid": pid,
            "sessionId": info["id"],
            "cwd": info["cwd"],
            "startedAt": info.get("startedAt", int(time.time() * 1000)),
            "updatedAt": int(time.time() * 1000),
            "name": info["name"],
            "status": "busy",
            "alive": True,
            "appManaged": True,
            "appAgentId": info["id"],
            "parentSessionId": info.get("parentSessionId"),
            "llm": info.get("llm", "claude"),
        })
    return sessions


def pid_alive(pid):
    try:
        os.kill(pid, 0)
    except (ProcessLookupError, PermissionError):
        return pid_error_is_permission(pid)
    except OSError:
        return False
    return True


def pid_error_is_permission(pid):
    # PermissionError ainda significa que o processo existe (dono diferente)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _proc_comm(pid):
    """Nome do binario rodando nesse pid (via /proc), pra confirmar que e
    realmente um `claude` antes de deixar o usuario mata-lo pelo dashboard —
    nao deixa isso virar um 'mate qualquer pid' generico."""
    try:
        return Path(f"/proc/{pid}/comm").read_text().strip()
    except OSError:
        return None


def kill_real_session(pid):
    """Mata de verdade uma sessao EXTERNA (rodando fora do controle do app,
    ex: um terminal real que o usuario tinha aberto) pelo pid do SO. So age
    se o processo realmente for um `claude` — protege contra matar qualquer
    coisa a partir de um pid arbitrario vindo da API."""
    if not pid_alive(pid):
        return False
    comm = _proc_comm(pid)
    if comm not in ("claude", "node"):  # o binario do claude roda sob node em alguns setups
        return False
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return False
    except PermissionError:
        return False
    return True


def read_sessions():
    sessions = []
    if not SESSIONS_DIR.exists():
        return sessions
    for f in SESSIONS_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        pid = data.get("pid")
        alive = pid_alive(pid) if pid else False
        data["alive"] = alive
        # bridgeSessionId so aparece quando a sessao tem "Remote Control" ativado
        # (controlada por um app remoto/mobile) -- e a propria CLI quem grava isso
        # no arquivo de sessao local, nao precisa de nenhuma API de nuvem pra saber.
        data["remoteControl"] = bool(data.get("bridgeSessionId"))
        sessions.append(data)
    return sessions


def transcript_path(cwd, session_id):
    project_dir = PROJECTS_DIR / cwd.replace("/", "-")
    fpath = project_dir / f"{session_id}.jsonl"
    return fpath if fpath.exists() else None


_EFFORT_CACHE = {}  # caminho do transcript (str) -> (mtime, {"effort":..., "model":...})
_EFFORT_TAIL_BYTES = 200_000  # basta pra achar a ULTIMA mensagem do assistente sem ler o arquivo inteiro


_ANSI_RE = re.compile("\x1b\\[[0-9;]*m")
_MODEL_CMD_RE = re.compile(r"Set model to\s+(.+?)\s+and saved")


def _read_latest_effort_model(fpath):
    """Le o rabo do transcript e devolve o `effort`/`model` mais recentes — sao
    gravados pela propria CLI em todo turno do assistente, refletem a config
    atual da sessao (efeito de /model, --effort etc), nao precisam de scan
    completo. O comando `/model` sozinho (sem novo turno do assistente) NAO
    grava uma mensagem "assistant" nova — so um "user"/local-command-stdout
    com o nome amigavel do modelo escolhido ("Set model to **Haiku 4.5** e
    salvo...") — sem tratar esse caso o card ficava preso no modelo/esforco
    do ULTIMO turno de verdade, ignorando uma troca de modelo feita na hora."""
    try:
        mtime = fpath.stat().st_mtime
    except OSError:
        return {}
    cache_key = str(fpath)
    cached = _EFFORT_CACHE.get(cache_key)
    if cached and cached[0] == mtime:
        return cached[1]

    result_effort = None
    result_model = None
    try:
        size = fpath.stat().st_size
        with fpath.open("rb") as f:
            if size > _EFFORT_TAIL_BYTES:
                f.seek(size - _EFFORT_TAIL_BYTES)
            raw = f.read()
        lines = raw.decode("utf-8", "ignore").split("\n")
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            if result_effort is not None and result_model is not None:
                break
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            dtype = data.get("type")
            if dtype == "assistant":
                if result_effort is None:
                    result_effort = data.get("effort")
                if result_model is None:
                    result_model = (data.get("message") or {}).get("model")
            elif dtype == "user" and result_model is None:
                content = (data.get("message") or {}).get("content")
                if isinstance(content, str):
                    m = _MODEL_CMD_RE.search(_ANSI_RE.sub("", content))
                    if m:
                        # nome amigavel (ex: "Haiku 4.5") — o frontend
                        # (shortModel) ja sabe exibir esse formato sem
                        # precisar do id interno cru (ex: "claude-haiku-4-5").
                        result_model = m.group(1).strip()
    except OSError:
        pass

    result = {} if result_effort is None and result_model is None else {
        "effort": result_effort,
        "model": result_model,
    }
    _EFFORT_CACHE[cache_key] = (mtime, result)
    return result


# nome da ferramenta MCP vem como "mcp__<servidor>__<ferramenta>" (ex:
# "mcp__redmine__getIssue") -- so extrai server/ferramenta e um palpite
# GET/POST pelo prefixo do nome, sem precisar de config nenhuma por servidor:
# qualquer MCP conectado vira "conhecido" automaticamente pelo proprio nome.
MCP_TOOL_RE = re.compile(r"^mcp__([^_]+(?:-[^_]+)*)__(.+)$")
MCP_WRITE_PREFIXES = ("create", "update", "delete", "set", "write", "put", "post", "remove", "add", "edit")
MCP_READ_PREFIXES = ("get", "list", "search", "read", "find", "fetch", "query", "view")


URL_HOST_RE = re.compile(r"https?://([^/\s\"']+)")


def _classify_web_activity(name, inp):
    """Detecta conexao HTTP fora de um MCP formal: WebFetch (tem URL direto),
    WebSearch (busca na web), ou Bash chamando curl/wget/gh/git contra uma URL
    — cobre o caso comum de "o agente usou `gh api ...`" que nao passa por
    nenhum servidor MCP, so por uma ferramenta nativa."""
    if name == "WebFetch":
        url = inp.get("url", "")
        m = URL_HOST_RE.search(url)
        host = m.group(1) if m else (url or "web")
        return {"server": host, "tool": "fetch", "method": "GET"}
    if name == "WebSearch":
        query = inp.get("query", "") or ""
        return {"server": "web search", "tool": query[:60] or "busca", "method": "SEARCH"}
    if name == "Bash":
        cmd = inp.get("command", "") or ""
        m = URL_HOST_RE.search(cmd)
        if m:
            return {"server": m.group(1), "tool": "bash", "method": "CALL"}
        if re.search(r"(^|[|&;]\s*)gh\s", cmd):
            return {"server": "github.com", "tool": "gh cli", "method": "CALL"}
    return None


def _classify_mcp_tool(tool_name):
    match = MCP_TOOL_RE.match(tool_name or "")
    if not match:
        return None
    server, tool = match.group(1), match.group(2)
    tool_lower = tool.lower()
    if tool_lower.startswith(MCP_WRITE_PREFIXES):
        method = "POST"
    elif tool_lower.startswith(MCP_READ_PREFIXES):
        method = "GET"
    else:
        method = "CALL"
    return {"server": server, "tool": tool, "method": method}


_MCP_CACHE = {}  # caminho do transcript (str) -> (mtime, {"mcp": [...], "skill": [...]})
MCP_ACTIVE_WINDOW_SECS = 180  # mesma heuristica de "ainda ativo" usada pra subagentes


def _scan_tool_activity(fpath):
    """Le o rabo do transcript e devolve, por servidor MCP e por skill, a
    ULTIMA chamada feita — usado pra mostrar como "no" na arvore o que a
    sessao esta usando agora (MCP tipo redmine/claude-in-chrome, ou uma
    skill tipo artifact-design), sem exigir cadastro previo de nada disso."""
    try:
        mtime = fpath.stat().st_mtime
    except OSError:
        return {"mcp": [], "skill": []}
    cache_key = str(fpath)
    cached = _MCP_CACHE.get(cache_key)
    if cached and cached[0] == mtime:
        return cached[1]

    by_server = {}
    by_skill = {}
    try:
        size = fpath.stat().st_size
        with fpath.open("rb") as f:
            if size > _EFFORT_TAIL_BYTES:
                f.seek(size - _EFFORT_TAIL_BYTES)
            raw = f.read()
        lines = raw.decode("utf-8", "ignore").split("\n")
        for line in lines:
            if '"type":"tool_use"' not in line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            if data.get("type") != "assistant":
                continue
            content = (data.get("message") or {}).get("content") or []
            ts = data.get("timestamp")
            if not isinstance(content, list):
                continue
            for item in content:
                if not isinstance(item, dict) or item.get("type") != "tool_use":
                    continue
                name = item.get("name", "")
                if name == "Skill":
                    skill = (item.get("input") or {}).get("skill")
                    if skill:
                        by_skill[skill] = {"skill": skill, "ts": ts}
                    continue
                info = _classify_mcp_tool(name) or _classify_web_activity(name, item.get("input") or {})
                if not info:
                    continue
                info["ts"] = ts
                by_server[info["server"]] = info
    except OSError:
        pass

    result = {"mcp": list(by_server.values()), "skill": list(by_skill.values())}
    _MCP_CACHE[cache_key] = (mtime, result)
    return result


def _mcp_ts_recent(ts, window_secs):
    if not ts:
        return False
    try:
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return False
    return (time.time() - dt.timestamp()) < window_secs


def _synthetic_activity_node(node_id, session_id, name, extra):
    return {
        "pid": -(int(hashlib.sha1(node_id.encode()).hexdigest(), 16) % 2_000_000_000 + 1),
        "sessionId": node_id,
        "cwd": "",
        "startedAt": 0,
        "updatedAt": int(time.time() * 1000),
        "name": name,
        "status": "busy",
        "alive": True,
        "appManaged": False,
        "appAgentId": None,
        "isSubagent": False,
        "parentSessionId": session_id,
        **extra,
    }


def _mcp_nodes_for_session(session_id, fpath):
    """Sintetiza um "no" de arvore por MCP/skill em uso recente por essa
    sessao — mesmo formato de sessao sintetica que find_subagent_transcripts()
    usa, entao a arvore no frontend nao precisa de nenhum caso especial pra
    desenhar/posicionar isso."""
    activity = _scan_tool_activity(fpath)
    nodes = []
    for info in activity["mcp"]:
        if not _mcp_ts_recent(info.get("ts"), MCP_ACTIVE_WINDOW_SECS):
            continue
        server = info["server"]
        node_id = f"mcp-{session_id}-{server}"
        nodes.append(_synthetic_activity_node(node_id, session_id, server.upper(), {
            "isMcp": True,
            "mcpServer": server,
            "mcpTool": info["tool"],
            "mcpMethod": info["method"],
        }))
    for info in activity["skill"]:
        if not _mcp_ts_recent(info.get("ts"), MCP_ACTIVE_WINDOW_SECS):
            continue
        skill = info["skill"]
        node_id = f"skill-{session_id}-{skill}"
        nodes.append(_synthetic_activity_node(node_id, session_id, skill, {
            "isSkill": True,
            "skillName": skill,
        }))
    return nodes


SUBAGENT_ALIVE_WINDOW_SECS = 180  # sem sinal explicito de "terminou", usamos mtime recente como heuristica de "ainda vivo"


def _read_subagent_cwd(fpath):
    """Le a primeira linha valida do transcript do subagente e devolve o cwd registrado nela."""
    try:
        with fpath.open("r", errors="ignore") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                return data.get("cwd") or ""
    except OSError:
        pass
    return ""


_ROLE_CACHE = {}  # caminho do transcript do pai (str) -> (mtime, {agentId: {"role":..., "description":...}})
AGENT_ID_IN_RESULT_RE = re.compile(r"agentId:\s*([a-f0-9]{6,})")


def _scan_agent_roles(parent_transcript_path):
    """Le o transcript da sessao PAI e extrai, pra cada subagente que ela disparou
    via a ferramenta Agent, qual `subagent_type` (papel: orquestrador, feature,
    spec, etc) e `description` foram usados — casando o tool_use com o
    tool_result correspondente (que informa o agentId gerado). Cacheado por
    mtime do arquivo do pai, senao reprocessar um transcript de varios MB a
    cada poll de /api/state (a cada 2s) ficaria caro."""
    try:
        mtime = parent_transcript_path.stat().st_mtime
    except OSError:
        return {}
    cache_key = str(parent_transcript_path)
    cached = _ROLE_CACHE.get(cache_key)
    if cached and cached[0] == mtime:
        return cached[1]

    roles = {}
    pending = {}  # tool_use_id -> {"role":..., "description":...}
    try:
        with parent_transcript_path.open("r", errors="ignore") as f:
            for line in f:
                # pre-filtro textual barato pra nao dar json.loads em toda linha
                # de um transcript que pode ter varios MB
                if "Agent" not in line and "agentId" not in line:
                    continue
                try:
                    d = json.loads(line)
                except json.JSONDecodeError:
                    continue
                t = d.get("type")
                if t == "assistant":
                    for item in d.get("message", {}).get("content", []) or []:
                        if isinstance(item, dict) and item.get("type") == "tool_use" and item.get("name") == "Agent":
                            inp = item.get("input", {}) or {}
                            pending[item.get("id")] = {
                                "role": inp.get("subagent_type") or "",
                                "description": inp.get("description") or "",
                            }
                elif t == "user":
                    content = d.get("message", {}).get("content")
                    if isinstance(content, list):
                        for item in content:
                            if not (isinstance(item, dict) and item.get("type") == "tool_result"):
                                continue
                            tu_id = item.get("tool_use_id")
                            if tu_id not in pending:
                                continue
                            text = item.get("content")
                            if isinstance(text, list):
                                text = " ".join(
                                    part.get("text", "") for part in text if isinstance(part, dict)
                                )
                            match = AGENT_ID_IN_RESULT_RE.search(text or "")
                            if match:
                                roles[match.group(1)] = pending.pop(tu_id)
    except OSError:
        return {}
    _ROLE_CACHE[cache_key] = (mtime, roles)
    return roles


def find_subagent_transcripts():
    """Descobre subagentes disparados via Agent/Task (sem PID/processo proprio, sem
    entrada em ~/.claude/sessions/*.json) varrendo os transcripts que eles proprios
    escrevem em PROJECTS_DIR/<projeto>/<sessionId-pai>/subagents/agent-<agentId>.jsonl,
    e devolve uma "sessao" sintetica por arquivo, no mesmo formato de read_sessions()."""
    sessions = []
    if not PROJECTS_DIR.exists():
        return sessions
    now = time.time()
    for fpath in PROJECTS_DIR.glob("*/*/subagents/agent-*.jsonl"):
        agent_id = fpath.stem[len("agent-"):]
        if not agent_id:
            continue
        try:
            mtime = fpath.stat().st_mtime
        except OSError:
            continue
        if (now - mtime) >= SUBAGENT_ALIVE_WINDOW_SECS:
            continue  # subagente ja terminou (heuristica por atividade recente) - nao reporta lixo historico
        # fpath = PROJECTS_DIR/<projeto>/<sessionId-pai>/subagents/agent-<agentId>.jsonl
        parent_session_id = fpath.parent.parent.name
        parent_transcript = fpath.parent.parent.parent / f"{parent_session_id}.jsonl"
        role_info = _scan_agent_roles(parent_transcript).get(agent_id, {})
        role = role_info.get("role") or ""
        effort_model = _read_latest_effort_model(fpath)
        sessions.append({
            "pid": -(int(hashlib.sha1(agent_id.encode()).hexdigest(), 16) % 2_000_000_000 + 1),
            "sessionId": agent_id,
            "cwd": _read_subagent_cwd(fpath),
            "startedAt": int(mtime * 1000),
            "updatedAt": int(mtime * 1000),
            "name": role or f"subagente {agent_id[:8]}",
            "role": role,
            "roleDescription": role_info.get("description") or "",
            "effort": effort_model.get("effort"),
            "model": effort_model.get("model"),
            "status": "busy",
            "alive": True,
            "appManaged": False,
            "appAgentId": None,
            "isSubagent": True,
            "parentSessionId": parent_session_id,
            "_transcriptPath": str(fpath),
        })
    return sessions


def resolve_transcript(session):
    """Caminho do transcript de uma sessao: usa o caminho ja conhecido (subagentes,
    que nao moram em PROJECTS_DIR/<cwd>/<sessionId>.jsonl) quando disponivel, senao
    cai para a resolucao normal por cwd+sessionId."""
    known_path = session.get("_transcriptPath")
    if known_path:
        fpath = Path(known_path)
        return fpath if fpath.exists() else None
    return transcript_path(session.get("cwd", ""), session["sessionId"])


MAX_TEXT_LEN = 800  # teto de seguranca para texto do assistente/usuario (preserva markdown/negrito)
MAX_TOOL_DETAIL_LEN = 200  # teto para o detalhe (comando/arquivo) de uma chamada de ferramenta
HISTORY_BACKLOG_STEPS = 400  # quantos passos do historico completo mandar ao abrir uma sessao
MAX_DIFF_TEXT_LEN = 6000  # teto generoso pro old/new text de Edit/Write (e codigo, precisa vir quase sempre inteiro)


def truncate(s, n=90, collapse_newlines=True):
    s = (s or "").strip()
    if collapse_newlines:
        s = s.replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"


def parse_step(raw_line):
    """Extrai um passo legivel (ou lista deles) de uma linha do transcript."""
    try:
        d = json.loads(raw_line)
    except json.JSONDecodeError:
        return []

    steps = []
    ts = d.get("timestamp")
    t = d.get("type")

    if t == "user":
        content = d.get("message", {}).get("content")
        if isinstance(content, str):
            steps.append({"kind": "prompt", "text": truncate(content, MAX_TEXT_LEN, collapse_newlines=False), "ts": ts})
        elif isinstance(content, list):
            for item in content:
                if not isinstance(item, dict):
                    continue
                if item.get("type") == "text":
                    text = item.get("text") or ""
                    # o anexo de uma imagem gera uma linha PROPRIA tipo
                    # "[Image: source: /caminho/completo.png]" - redundante, ja
                    # que a referencia "[Image #N]" aparece inline na mensagem
                    # de verdade. O CLI real nunca mostra esse caminho cru.
                    if re.match(r"^\[Image:\s*source:.*\]$", text.strip()):
                        continue
                    steps.append({
                        "kind": "prompt",
                        "text": truncate(text, MAX_TEXT_LEN, collapse_newlines=False),
                        "ts": ts,
                    })
                elif item.get("type") == "tool_result":
                    pass  # ruido demais, ignorado

    elif t == "assistant":
        message = d.get("message", {})
        content = message.get("content", [])
        usage = message.get("usage") or {}
        tokens = (
            (usage.get("input_tokens") or 0)
            + (usage.get("output_tokens") or 0)
            + (usage.get("cache_read_input_tokens") or 0)
            + (usage.get("cache_creation_input_tokens") or 0)
        )
        if isinstance(content, list):
            for item in content:
                if not isinstance(item, dict):
                    continue
                if item.get("type") == "text":
                    text = item.get("text", "")
                    if text.strip():
                        steps.append({
                            "kind": "text",
                            "text": truncate(text, MAX_TEXT_LEN, collapse_newlines=False),
                            "ts": ts,
                            "tokens": tokens,
                        })
                elif item.get("type") == "tool_use":
                    name = item.get("name", "tool")
                    inp = item.get("input", {}) or {}
                    detail = inp.get("description") or inp.get("command") or \
                        inp.get("prompt") or inp.get("file_path") or inp.get("pattern") or ""
                    if not detail:
                        for v in inp.values():
                            if isinstance(v, str):
                                detail = v
                                break
                    step = {
                        "kind": "tool",
                        "name": name,
                        "text": truncate(detail, MAX_TOOL_DETAIL_LEN),
                        "ts": ts,
                        "tokens": tokens,
                    }
                    mcp_info = _classify_mcp_tool(name)
                    if mcp_info:
                        step["mcp"] = mcp_info
                    if name in ("Edit", "Write"):
                        # diff completo (nao o "detail" generico truncado) pra
                        # renderizar como bloco +/- de verdade, igual o CLI real
                        old_text = inp.get("old_string", "") if name == "Edit" else ""
                        new_text = inp.get("new_string") or inp.get("content") or ""
                        step["diff"] = {
                            "file": inp.get("file_path", ""),
                            "oldText": truncate(old_text, MAX_DIFF_TEXT_LEN, collapse_newlines=False),
                            "newText": truncate(new_text, MAX_DIFF_TEXT_LEN, collapse_newlines=False),
                        }
                    steps.append(step)

    return steps


def _parse_frontmatter(text):
    """Parser minimo de frontmatter YAML (so os campos simples que os arquivos
    de agente/skill do Claude Code realmente usam: `key: valor` e blocos
    dobrados `key: >-` com continuacao indentada) — sem depender de nenhuma
    lib externa, pra manter o backend 100% stdlib como o resto do projeto."""
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    body = text[3:end]
    result = {}
    lines = body.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.startswith(" ") or line.startswith("\t"):
            i += 1
            continue
        if ":" not in line:
            i += 1
            continue
        key, _, rest = line.partition(":")
        key = key.strip()
        rest = rest.strip()
        if rest in (">-", ">", "|-", "|"):
            parts = []
            i += 1
            while i < len(lines) and (lines[i].startswith(" ") or lines[i].startswith("\t") or not lines[i].strip()):
                parts.append(lines[i].strip())
                i += 1
            result[key] = " ".join(p for p in parts if p).strip()
            continue
        result[key] = rest.strip('"').strip("'")
        i += 1
    return result


_AGENT_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def _agent_file_path(name, kind="agent"):
    """Resolve o caminho de ~/.claude/agents/<name>.md (kind="agent") ou
    ~/.claude/skills/<name>/SKILL.md (kind="skill"), com validacao estrita
    do nome (so letras/numeros/-/_) — evita path traversal (../../etc) numa
    rota que le E escreve arquivo a partir de um parametro vindo da API."""
    if not name or not _AGENT_NAME_RE.match(name):
        return None
    if kind == "skill":
        return CLAUDE_DIR / "skills" / name / "SKILL.md"
    return CLAUDE_DIR / "agents" / f"{name}.md"


def read_agents_catalog():
    """Agentes customizados (subagentes) definidos em ~/.claude/agents/*.md —
    o mesmo catalogo que o proprio Claude Code usa pra saber quais subagent_type
    existem (bugfix, feature, orquestrador, etc)."""
    agents = []
    agents_dir = CLAUDE_DIR / "agents"
    if not agents_dir.exists():
        return agents
    for f in sorted(agents_dir.glob("*.md")):
        try:
            fm = _parse_frontmatter(f.read_text(errors="ignore"))
        except OSError:
            continue
        agents.append({
            "name": fm.get("name") or f.stem,
            "description": fm.get("description", ""),
            "model": fm.get("model", ""),
            "tools": fm.get("tools", ""),
        })
    return agents


def read_skills_catalog():
    """Skills instaladas em ~/.claude/skills/<nome>/SKILL.md."""
    skills = []
    skills_dir = CLAUDE_DIR / "skills"
    if not skills_dir.exists():
        return skills
    for d in sorted(skills_dir.iterdir()):
        f = d / "SKILL.md"
        if not d.is_dir() or not f.exists():
            continue
        try:
            fm = _parse_frontmatter(f.read_text(errors="ignore"))
        except OSError:
            continue
        skills.append({
            "name": fm.get("name") or d.name,
            "description": fm.get("description", ""),
            "version": fm.get("version", ""),
        })
    return skills


# ferramentas nativas do Claude Code (nao-MCP) — lista fixa, o CLI nao expoe
# isso em nenhum arquivo local pra ler; e a mesma lista documentada oficialmente.
BUILTIN_TOOLS = [
    "Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch",
    "Task", "TodoWrite", "NotebookEdit", "BashOutput", "KillShell",
]


def read_mcp_catalog():
    """Servidores MCP configurados, agregados de todos os projetos conhecidos
    em ~/.claude.json (a config e por-projeto, nao global) — "conectado" aqui
    significa "configurado e habilitado", nao necessariamente com uma chamada
    recente (isso quem mostra e o no de atividade na arvore de sessoes)."""
    try:
        cfg = json.loads((Path.home() / ".claude.json").read_text())
    except (OSError, json.JSONDecodeError):
        return []
    servers = {}
    for proj_path, proj_cfg in (cfg.get("projects") or {}).items():
        if not isinstance(proj_cfg, dict):
            continue
        disabled = set(proj_cfg.get("disabledMcpjsonServers") or [])
        for name, server_cfg in (proj_cfg.get("mcpServers") or {}).items():
            entry = servers.setdefault(name, {
                "name": name,
                "type": (server_cfg or {}).get("type", "stdio") if isinstance(server_cfg, dict) else "stdio",
                "projects": [],
                "enabled": True,
            })
            entry["projects"].append(proj_path)
            if name in disabled:
                entry["enabled"] = False
    return list(servers.values())


# CLIs de outros LLMs/agentes conhecidas — so detecta se o binario existe no
# PATH (proxy razoavel de "instalado"; nao ha como checar autenticacao de
# terceiros genericamente daqui). "install" e so uma dica de comando, o
# usuario ainda precisa rodar/autenticar por conta propria.
# "login" e o melhor-esforco pra cada CLI (comando mais comum documentado por
# cada uma pra autenticar) — nao temos como testar isso sem a CLI de verdade
# instalada, entao pode precisar de ajuste se a CLI mudar o proprio comando.
# So roda se o install anterior sair com sucesso (encadeado com &&).
KNOWN_LLM_CLIS = [
    {"id": "codex", "name": "Codex CLI", "bin": "codex", "vendor": "OpenAI", "install": "npm install -g @openai/codex", "login": "codex login", "logout": "codex logout"},
    {"id": "gemini", "name": "Gemini CLI", "bin": "gemini", "vendor": "Google", "install": "npm install -g @google/gemini-cli", "login": "gemini", "logout": "rm -rf ~/.gemini/oauth_creds.json"},
    {"id": "cursor-agent", "name": "Cursor Agent", "bin": "cursor-agent", "vendor": "Cursor", "install": "curl https://cursor.com/install -fsS | bash", "login": "cursor-agent login", "logout": "cursor-agent logout"},
    {"id": "aider", "name": "Aider", "bin": "aider", "vendor": "Aider", "install": "pipx install aider-chat", "login": "", "logout": ""},
    {"id": "opencode", "name": "OpenCode", "bin": "opencode", "vendor": "OpenCode", "install": "npm install -g opencode-ai", "login": "opencode auth login", "logout": "opencode auth logout"},
    {"id": "amp", "name": "Amp", "bin": "amp", "vendor": "Sourcegraph", "install": "npm install -g @sourcegraph/amp", "login": "amp login", "logout": "amp logout"},
    {"id": "copilot", "name": "GitHub Copilot CLI", "bin": "copilot", "vendor": "GitHub", "install": "npm install -g @github/copilot", "login": "gh auth login", "logout": "gh auth logout"},
    # LLMs abertas/locais — rodam modelo local, sem chave de API de terceiro,
    # nao tem "login"/"logout" (nada pra autenticar num serviço externo).
    {"id": "ollama", "name": "Ollama", "bin": "ollama", "vendor": "Ollama (open-source)", "install": "curl -fsSL https://ollama.com/install.sh | sh", "login": "", "logout": ""},
    {"id": "llamafile", "name": "Llamafile", "bin": "llamafile", "vendor": "Mozilla (open-source)", "install": "pipx install llamafile", "login": "", "logout": ""},
    # Claude Code (a propria CLI que roda o app) — so entra aqui pra
    # /api/install/start achar os comandos reais de login/logout
    # (`claude auth login|logout`, confirmados via `claude auth --help`).
    # read_llm_clis() PULA esse id de proposito (ver abaixo) — o Claude ja
    # aparece na listagem via CLAUDE_LLM_OPTION no frontend, incluir aqui
    # tambem duplicaria a linha.
    {"id": "claude", "name": "Claude Code", "bin": "claude", "vendor": "Anthropic", "install": "", "login": "claude auth login", "logout": "claude auth logout"},
]


def _claude_authenticated():
    """Claude Code esta autenticado ⇔ ~/.claude.json tem a chave de topo
    "oauthAccount" (presente so depois de login OAuth bem-sucedido)."""
    try:
        cfg = json.loads((Path.home() / ".claude.json").read_text())
    except (OSError, json.JSONDecodeError):
        return False
    return bool(cfg.get("oauthAccount"))


def _gemini_authenticated():
    """Gemini CLI grava as credenciais OAuth em ~/.gemini/oauth_creds.json —
    e o mesmo arquivo que o "logout" desta CLI (acima) apaga, entao a
    existencia dele e um sinal consistente com o resto deste arquivo."""
    return (Path.home() / ".gemini" / "oauth_creds.json").is_file()


def _cursor_authenticated():
    """Cursor Agent grava o token em ~/.config/cursor/auth.json quando
    autenticado; exige conteudo real (nao so um arquivo vazio/quase vazio)."""
    try:
        content = (Path.home() / ".config" / "cursor" / "auth.json").read_text()
    except OSError:
        return False
    return len(content.strip()) > 2


def _gh_authenticated():
    """Copilot CLI usa `gh auth login`/`gh auth logout` (GitHub CLI) por
    baixo dos panos; ~/.config/gh/hosts.yml existe sempre que o gh ja foi
    configurado, mas fica "{}" (mapa YAML vazio) quando nenhum host esta
    logado — checagem de string simples, sem precisar de parser YAML."""
    try:
        content = (Path.home() / ".config" / "gh" / "hosts.yml").read_text()
    except OSError:
        return False
    return content.strip() != "{}"


def _codex_authenticated():
    """Codex CLI (OpenAI) documenta gravar credenciais em ~/.codex/auth.json
    apos login bem-sucedido."""
    return (Path.home() / ".codex" / "auth.json").is_file()


def _opencode_authenticated():
    """MELHOR-ESFORCO / NAO VERIFICADO: nao ha um local documentado unico
    pra credenciais do OpenCode; checamos alguns caminhos plausiveis. Se
    nenhum bater, assume nao-autenticado (preferimos subestimar a reportar
    "conectado" errado)."""
    candidates = [
        Path.home() / ".local" / "share" / "opencode" / "auth.json",
        Path.home() / ".config" / "opencode" / "auth.json",
    ]
    for candidate in candidates:
        try:
            if len(candidate.read_text().strip()) > 2:
                return True
        except OSError:
            continue
    return False


def _amp_authenticated():
    """MELHOR-ESFORCO / NAO VERIFICADO: nenhum arquivo de credencial conhecido
    foi encontrado nesta maquina pra Amp; checamos caminhos plausiveis e
    assumimos nao-autenticado se nenhum bater."""
    candidates = [
        Path.home() / ".config" / "amp" / "auth.json",
        Path.home() / ".local" / "share" / "amp" / "auth.json",
        Path.home() / ".amp" / "auth.json",
    ]
    for candidate in candidates:
        try:
            if len(candidate.read_text().strip()) > 2:
                return True
        except OSError:
            continue
    return False


# checagem de autenticacao real por CLI — so pras que temos um local de
# credencial conhecido (ou melhor-esforco); as demais (sem conceito de
# login, ou desconhecidas) caem no fallback "authenticated == installed"
# dentro de read_llm_clis().
AUTH_CHECKS = {
    "gemini": _gemini_authenticated,
    "cursor-agent": _cursor_authenticated,
    "copilot": _gh_authenticated,
    "codex": _codex_authenticated,
    "opencode": _opencode_authenticated,
    "amp": _amp_authenticated,
}


def read_claude_usage():
    """Uso/quota REAL do Claude (a propria CLI grava isso em ~/.claude.json
    depois de consultar a API) — janelas de 5h e 7 dias, em % utilizado, com
    o horario de reset. Nao existe equivalente pras outras CLIs (nenhuma
    grava dado de quota local que este backend consiga ler), entao so o
    Claude tem numero de uso de verdade — as outras so mostram conectado/nao."""
    try:
        cfg = json.loads((Path.home() / ".claude.json").read_text())
    except (OSError, json.JSONDecodeError):
        return None
    util = (cfg.get("cachedUsageUtilization") or {}).get("utilization") or {}
    five_hour = util.get("five_hour") or {}
    seven_day = util.get("seven_day") or {}
    if not five_hour and not seven_day:
        return None
    return {
        "fiveHour": {"utilization": five_hour.get("utilization"), "resetsAt": five_hour.get("resets_at")},
        "sevenDay": {"utilization": seven_day.get("utilization"), "resetsAt": seven_day.get("resets_at")},
    }


def read_llm_clis():
    result = []
    path_dirs = os.environ.get("PATH", "").split(os.pathsep)
    for cli in KNOWN_LLM_CLIS:
        if cli["id"] == "claude":
            continue  # so serve pro /api/install/start achar login/logout — ver comentario acima
        found = None
        for d in path_dirs:
            candidate = Path(d) / cli["bin"]
            if candidate.is_file() and os.access(candidate, os.X_OK):
                found = str(candidate)
                break
        installed = bool(found)
        auth_check = AUTH_CHECKS.get(cli["id"])
        authenticated = auth_check() if auth_check else installed
        if installed and authenticated:
            status = "connected"
        elif installed:
            status = "installed"
        else:
            status = "none"
        result.append({
            **cli,
            "connected": installed and authenticated,
            "status": status,
            "path": found,
        })
    return result


def read_teams():
    teams = []
    if not TEAMS_DIR.exists():
        return teams
    for team_dir in TEAMS_DIR.iterdir():
        cfg = team_dir / "config.json"
        if not cfg.exists():
            continue
        try:
            data = json.loads(cfg.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        teams.append(data)
    return teams


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # silencia logs de acesso

    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.headers.get("Upgrade", "").lower() == "websocket" and self.path.startswith("/ws/agent/"):
            agent_id = self.path.rsplit("/", 1)[-1]
            self._handle_terminal_ws(agent_id)
            return

        if self.path.startswith("/api/state"):
            sessions = read_sessions()
            teams = read_teams()
            activity_nodes = []
            for s in sessions:
                info = app_agent_by_pid(s.get("pid"))
                s["appManaged"] = bool(info)
                s["appAgentId"] = info["id"] if info else None
                if info and info.get("nameIsCustom"):
                    # a sessao REAL (lida de ~/.claude/sessions) tem seu
                    # proprio nome auto-derivado pela CLI (ex: "backoffice-89",
                    # com sufixo aleatorio pra evitar colisao) — se o usuario
                    # deu um nome customizado ao criar o agente pelo app, esse
                    # nome deve prevalecer na exibicao, nao o derivado.
                    s["name"] = info["name"]
                fpath = transcript_path(s.get("cwd", ""), s.get("sessionId", ""))
                if fpath:
                    effort_model = _read_latest_effort_model(fpath)
                    s["effort"] = effort_model.get("effort")
                    s["model"] = effort_model.get("model")
                    activity_nodes += _mcp_nodes_for_session(s["sessionId"], fpath)
            sessions += find_subagent_transcripts()
            for s in sessions:
                if s.get("isSubagent") and s.get("_transcriptPath"):
                    activity_nodes += _mcp_nodes_for_session(s["sessionId"], Path(s["_transcriptPath"]))
            sessions += activity_nodes
            # um agente iniciado pelo app roda um `claude` de verdade, que
            # depois de subir grava sua PROPRIA sessao real em
            # ~/.claude/sessions/*.json (achada acima por read_sessions() e
            # ja marcada appManaged=True via app_agent_by_pid) — sem esse
            # filtro, o registro sintetico de read_app_agent_sessions() pro
            # MESMO pid tambem entrava na lista, e o mesmo agente aparecia
            # como DOIS cards/paineis diferentes (sessionId sintetico vs
            # sessionId real da CLI) assim que a sessao real terminava de
            # se registrar.
            covered_pids = {s.get("pid") for s in sessions if s.get("appManaged")}
            sessions += [s for s in read_app_agent_sessions() if s.get("pid") not in covered_pids]
            self._send_json({
                "now": int(time.time() * 1000),
                "sessions": sessions,
                "teams": teams,
            })
            return

        if self.path.startswith("/api/stream"):
            self._stream_steps()
            return

        if self.path.startswith("/api/catalog"):
            self._send_json({
                "agents": read_agents_catalog(),
                "skills": read_skills_catalog(),
                "tools": BUILTIN_TOOLS,
                "mcps": read_mcp_catalog(),
            })
            return

        if self.path.startswith("/api/llms"):
            self._send_json({"llms": read_llm_clis()})
            return

        if self.path.startswith("/api/usage"):
            self._send_json({"claude": read_claude_usage(), "claudeAuthenticated": _claude_authenticated()})
            return

        if self.path.startswith("/api/agent-file"):
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            name = (params.get("name") or [""])[0]
            kind = (params.get("kind") or ["agent"])[0]
            fpath = _agent_file_path(name, kind)
            if not fpath or not fpath.exists():
                self._send_json({"error": "não encontrado"}, status=404)
                return
            self._send_json({"name": name, "content": fpath.read_text(errors="ignore")})
            return

        # serve arquivos estaticos
        rel = self.path.lstrip("/") or "index.html"
        fpath = (STATIC_DIR / rel).resolve()
        if not str(fpath).startswith(str(STATIC_DIR.resolve())) or not fpath.exists():
            fpath = STATIC_DIR / "index.html"
        content_type = "text/html"
        if fpath.suffix == ".js":
            content_type = "application/javascript"
        elif fpath.suffix == ".css":
            content_type = "text/css"
        body = fpath.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            return json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return {}

    def do_POST(self):
        if self.path == "/api/agents/start":
            body = self._read_json_body()
            try:
                agent_id = spawn_agent(
                    body.get("cwd"),
                    body.get("name"),
                    body.get("resumeSessionId"),
                    body.get("parentSessionId"),
                    body.get("llm"),
                )
            except Exception as e:
                self._send_json({"error": str(e)}, status=400)
                return
            self._send_json({"id": agent_id})
            return

        if self.path.startswith("/api/agents/") and self.path.endswith("/stop"):
            agent_id = self.path.split("/")[3]
            ok = stop_agent(agent_id)
            self._send_json({"ok": ok})
            return

        if self.path == "/api/install/start":
            body = self._read_json_body()
            cli_id = body.get("cli", "")
            action = body.get("action", "install")  # "install" ou "logout"
            cli = next((c for c in KNOWN_LLM_CLIS if c["id"] == cli_id), None)
            if not cli:
                self._send_json({"error": "CLI desconhecida"}, status=400)
                return
            if action == "logout":
                if not cli.get("logout"):
                    self._send_json({"error": "essa CLI não tem comando de logout conhecido"}, status=400)
                    return
                agent_id = spawn_install(cli_id, cli["logout"])
                self._send_json({"id": agent_id})
                return
            if action == "login":
                # CLI ja instalada (so falta autenticar) — reaproveita o
                # comando de login sozinho, sem rodar o de instalacao de novo.
                if not cli.get("login"):
                    self._send_json({"error": "essa CLI não tem comando de login conhecido"}, status=400)
                    return
                agent_id = spawn_install(cli_id, cli["login"])
                self._send_json({"id": agent_id})
                return
            # encadeia instalacao + login (se a CLI tiver um) na mesma sessao
            # de PTY — assim o usuario ve instalar E autenticar num unico log
            # ao vivo, sem precisar abrir outro terminal por conta propria.
            command = cli["install"]
            if cli.get("login"):
                command = f"{command} && {cli['login']}"
            agent_id = spawn_install(cli_id, command)
            self._send_json({"id": agent_id})
            return

        if self.path == "/api/agent-file":
            body = self._read_json_body()
            name = body.get("name", "")
            content = body.get("content", "")
            fpath = _agent_file_path(name, body.get("kind", "agent"))
            if not fpath or not fpath.exists():
                self._send_json({"error": "não encontrado"}, status=404)
                return
            try:
                fpath.write_text(content)
            except OSError as e:
                self._send_json({"error": str(e)}, status=500)
                return
            self._send_json({"ok": True})
            return

        if self.path.startswith("/api/sessions/") and self.path.endswith("/kill"):
            # mata de verdade uma sessao EXTERNA (terminal real fora do controle
            # do app) pelo pid do SO — so aceita se o processo com esse pid for
            # de fato um `claude` (confere /proc/<pid>/comm), pra nao virar um
            # "mate qualquer processo" generico a partir do numero.
            try:
                pid = int(self.path.split("/")[3])
            except (ValueError, IndexError):
                self._send_json({"error": "pid inválido"}, status=400)
                return
            ok = kill_real_session(pid)
            self._send_json({"ok": ok})
            return

        self._send_json({"error": "not found"}, status=404)

    # ---- WebSocket bridge para o PTY do agente ----

    def _handle_terminal_ws(self, agent_id):
        with AGENTS_LOCK:
            info = AGENTS.get(agent_id)
        if not info:
            self.send_response(404)
            self.end_headers()
            return

        key = self.headers.get("Sec-WebSocket-Key", "")
        accept = base64.b64encode(
            hashlib.sha1((key + WS_GUID).encode()).digest()
        ).decode()
        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        self.end_headers()

        master_fd = info["master_fd"]
        write_lock = threading.Lock()
        closed_flag = threading.Event()

        def on_chunk(chunk, closed=False):
            if closed:
                closed_flag.set()
                try:
                    with write_lock:
                        self._ws_send(b"", opcode=0x8)
                except OSError:
                    pass
                return
            with write_lock:
                self._ws_send(chunk, opcode=0x2)

        # entrega o scrollback acumulado antes de virar "ao vivo"
        with info["buf_lock"]:
            backlog = bytes(info["buffer"])
            already_closed = info["closed"]
        if backlog:
            try:
                with write_lock:
                    self._ws_send(backlog, opcode=0x2)
            except OSError:
                return
        if already_closed:
            return

        with info["writers_lock"]:
            info["writers"].append(on_chunk)

        # rede de seguranca: se por algum motivo o frontend nunca mandar um
        # resize (bug, versao antiga em cache, etc), inicia o processo mesmo
        # assim depois de um tempo, com o tamanho padrao, pra nao travar pra sempre.
        def _fallback_start():
            time.sleep(1.5)
            _start_agent_process(agent_id)

        threading.Thread(target=_fallback_start, daemon=True).start()

        try:
            while not closed_flag.is_set():
                frame = self._ws_recv()
                if frame is None:
                    break
                opcode, payload = frame
                if opcode == 0x8:  # close (usuario fechou a aba/painel)
                    break
                elif opcode == 0x1:  # texto = mensagem de controle (resize)
                    try:
                        msg = json.loads(payload.decode("utf-8", "ignore"))
                    except json.JSONDecodeError:
                        msg = {}
                    if msg.get("type") == "resize":
                        rows = int(msg.get("rows", 30))
                        cols = int(msg.get("cols", 100))
                        try:
                            fcntl.ioctl(master_fd, termios.TIOCSWINSZ,
                                        struct.pack("HHHH", rows, cols, 0, 0))
                        except OSError:
                            pass
                        # so inicia o processo de verdade depois do 1o resize
                        # real (ou do fallback acima) — assim ele ja nasce com
                        # o tamanho certo, sem desenhar nada com tamanho errado.
                        _start_agent_process(agent_id)
                elif opcode == 0x2:  # binario = digitacao do usuario -> envia pro processo
                    try:
                        os.write(master_fd, payload)
                    except OSError:
                        break
        finally:
            # desconecta este viewer, mas o processo/agente continua rodando
            with info["writers_lock"]:
                if on_chunk in info["writers"]:
                    info["writers"].remove(on_chunk)

    def _ws_send(self, data, opcode=0x2):
        length = len(data)
        header = bytes([0x80 | opcode])
        if length < 126:
            header += bytes([length])
        elif length < 65536:
            header += bytes([126]) + struct.pack(">H", length)
        else:
            header += bytes([127]) + struct.pack(">Q", length)
        self.wfile.write(header + data)
        self.wfile.flush()

    def _ws_recv(self):
        parts = []
        opcode_out = None
        while True:
            hdr = self.rfile.read(2)
            if len(hdr) < 2:
                return None
            b0, b1 = hdr[0], hdr[1]
            fin = b0 & 0x80
            opcode = b0 & 0x0F
            masked = b1 & 0x80
            plen = b1 & 0x7F
            if plen == 126:
                plen = struct.unpack(">H", self.rfile.read(2))[0]
            elif plen == 127:
                plen = struct.unpack(">Q", self.rfile.read(8))[0]
            mask = self.rfile.read(4) if masked else b"\x00\x00\x00\x00"
            payload = self.rfile.read(plen) if plen else b""
            if masked:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if opcode_out is None and opcode != 0x0:
                opcode_out = opcode
            parts.append(payload)
            if fin:
                break
        return opcode_out, b"".join(parts)

    def _sse_send(self, event):
        payload = f"data: {json.dumps(event)}\n\n".encode("utf-8")
        self.wfile.write(payload)
        self.wfile.flush()

    def _stream_steps(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        offsets = {}   # sessionId -> byte offset lido
        leftover = {}  # sessionId -> pedaco incompleto de linha

        # find_subagent_transcripts() chama _scan_agent_roles() pra cada
        # subagente, que reprocessa o transcript inteiro do PAI (pode ter
        # varios MB) sempre que o mtime dele muda - e o mtime do pai muda o
        # tempo todo justamente enquanto ele supervisiona o subagente (o
        # cenario em que a atualizacao em tempo real mais importa). Chamar
        # isso a cada tick de 1s deste loop (bem mais frequente que os 2s de
        # /api/state, cadencia pra qual esse custo foi pensado - ver docstring
        # de _scan_agent_roles) fazia cada iteracao estourar bem alem de 1s
        # com subagentes ativos, atrasando o envio de TODOS os steps (nao so
        # os do subagente) pelo unico SSE compartilhado: na pratica, o painel
        # do subagente parecia travado/sem atualizar. A lista de subagentes
        # (que muda pouco de um tick pro outro) agora e recalculada no mesmo
        # ritmo de /api/state; a leitura incremental dos bytes novos de cada
        # transcript ja conhecido continua a cada 1s, sem essa lentidao.
        SUBAGENT_LIST_REFRESH_SECS = 2
        subagent_list = find_subagent_transcripts()
        next_subagent_refresh = time.time() + SUBAGENT_LIST_REFRESH_SECS

        try:
            # backlog inicial: ultimas linhas de cada sessao viva
            sessions = {
                s["sessionId"]: s
                for s in read_sessions() + subagent_list
                if s.get("alive")
            }
            for sid, s in sessions.items():
                fpath = resolve_transcript(s)
                if not fpath:
                    continue
                size = fpath.stat().st_size
                # historico completo da sessao (nao so os ultimos KB) - o usuario quer
                # ver a conversa inteira ao abrir, nao um recorte recente e fora de contexto
                with fpath.open("r", errors="ignore") as f:
                    chunk = f.read()
                offsets[sid] = size
                lines = chunk.split("\n")
                collected = []
                for line in lines:
                    if line.strip():
                        collected.extend(parse_step(line))
                for step in collected[-HISTORY_BACKLOG_STEPS:]:
                    step["sessionId"] = sid
                    step["pid"] = s["pid"]
                    step["name"] = step.get("name") or s.get("name")
                    self._sse_send({**step, "sessionName": s.get("name"), "backlog": True})

            while True:
                now = time.time()
                if now >= next_subagent_refresh:
                    subagent_list = find_subagent_transcripts()
                    next_subagent_refresh = now + SUBAGENT_LIST_REFRESH_SECS
                sessions = {
                    s["sessionId"]: s
                    for s in read_sessions() + subagent_list
                    if s.get("alive")
                }
                for sid, s in sessions.items():
                    fpath = resolve_transcript(s)
                    if not fpath:
                        continue
                    size = fpath.stat().st_size
                    if sid not in offsets:
                        # sessao nascida DEPOIS da conexao deste stream (agente
                        # criado durante o uso do app) - sem isso, `pos` nasceria
                        # = size (fim do arquivo) na 1a vez que este loop
                        # descobre a sessao, e tudo que ja tinha sido escrito no
                        # transcript ATE esse instante (ex: a resposta inicial de
                        # um agente recem-criado, que muitas vezes ja chega
                        # pronta no mesmo tick de 1s) seria silenciosamente
                        # perdido pra sempre - o painel abriria com o transcript
                        # incompleto e nunca se corrigiria sozinho. Manda esse
                        # conteudo ja existente como backlog agora, igual o bloco
                        # de conexao faz pras sessoes que ja estavam vivas na
                        # hora do connect.
                        with fpath.open("r", errors="ignore") as f:
                            chunk = f.read()
                        offsets[sid] = size
                        lines = chunk.split("\n")
                        collected = []
                        for line in lines:
                            if line.strip():
                                collected.extend(parse_step(line))
                        for step in collected[-HISTORY_BACKLOG_STEPS:]:
                            step["sessionId"] = sid
                            step["pid"] = s["pid"]
                            step["name"] = step.get("name") or s.get("name")
                            self._sse_send({**step, "sessionName": s.get("name"), "backlog": True})
                        continue
                    pos = offsets.get(sid, size)
                    if size < pos:
                        pos = 0  # arquivo rotacionado/truncado
                    if size > pos:
                        with fpath.open("r", errors="ignore") as f:
                            f.seek(pos)
                            chunk = f.read()
                        offsets[sid] = size
                        buf = leftover.get(sid, "") + chunk
                        lines = buf.split("\n")
                        leftover[sid] = lines[-1]
                        for line in lines[:-1]:
                            if not line.strip():
                                continue
                            for step in parse_step(line):
                                step["sessionId"] = sid
                                step["pid"] = s["pid"]
                                step["sessionName"] = s.get("name")
                                self._sse_send(step)
                self._sse_send({"kind": "ping"})
                time.sleep(1)
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Claude Sessions Dashboard rodando em http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
