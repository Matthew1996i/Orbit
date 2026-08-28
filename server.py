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
import queue
import re
import signal
import struct
import subprocess
import termios
import threading
import time
import urllib.parse
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

CLAUDE_DIR = Path.home() / ".claude"
SESSIONS_DIR = CLAUDE_DIR / "sessions"
TEAMS_DIR = CLAUDE_DIR / "teams"
CODEX_DIR = Path.home() / ".codex"
# quantas entradas MAIS RECENTES do indice do Codex olhar por sessao viva —
# o indice e append-only e so cresce, entao basta o rabo do arquivo pra achar
# qualquer sessao que ainda esteja rodando agora.
CODEX_INDEX_SCAN_LIMIT = 60
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
    # o app empacotado (Electron) e lancado pelo icone/launcher do SO, nao por
    # um shell de login — o processo do backend Python herda um PATH minimo
    # (ex: so /usr/bin:/bin) que nao inclui onde CLIs de usuario costumam
    # morar (~/.local/bin, onde o `claude` normalmente fica instalado, ou
    # ~/.nvm/versions/node/*/bin, onde qualquer CLI instalada via `npm
    # install -g` mora). Sem isso, o subprocess.Popen abaixo falha com
    # FileNotFoundError e o agente fica preso pra sempre (pid nunca sai de
    # None) sem nenhum aviso visivel. Mesma lista usada pra achar as CLIs na
    # tela de "conectar LLM" (ver _path_dirs_with_user_bins()), pra nao
    # divergir dessa outra deteccao de novo.
    clean_env["PATH"] = os.pathsep.join(_path_dirs_with_user_bins())
    env = dict(
        clean_env,
        TERM="xterm-256color",
        COLORTERM="truecolor",  # sem isso, algumas CLIs (inclusive o claude) caem pra uma paleta
        FORCE_COLOR="3",         # de cores mais pobre/diferente do terminal real, "parece outro tema"
    )
    try:
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
    except OSError as exc:
        # binario nao encontrado/sem permissao de execucao etc — sem isso o
        # agente ficava com pid=None pra sempre, "busy" no dashboard, mostrando
        # so "[desconectado]" no painel, sem nenhuma pista do motivo real.
        os.close(slave_fd)
        msg = f"\r\n\x1b[31mfalha ao iniciar '{' '.join(cmd)}': {exc}\x1b[0m\r\n".encode()
        with info["buf_lock"]:
            info["buffer"] += msg
            info["closed"] = True
        with info["writers_lock"]:
            writers = list(info["writers"])
        for w in writers:
            try:
                w(msg, closed=False)
                w(b"", closed=True)
            except Exception:
                pass
        return
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


def _proc_cmdline(pid):
    try:
        raw = Path(f"/proc/{pid}/cmdline").read_bytes()
        return raw.replace(b"\x00", b" ").decode("utf-8", "ignore").strip()
    except OSError:
        return ""


def _proc_cwd(pid):
    try:
        return os.readlink(f"/proc/{pid}/cwd")
    except OSError:
        return None


def _proc_has_live_tty(pid):
    """False quando o terminal de verdade por tras desse processo ja foi
    fechado mas o processo (uma CLI externa tipo Copilot/Codex/Antigravity)
    continuou vivo em segundo plano, orfao — confirmado na pratica: nesse
    caso o stdin do processo aponta pra um pty que o kernel ja marca como
    "(deleted)" (o dispositivo /dev/pts/N sumiu, mas o processo ainda
    segura um file descriptor aberto pra ele). Sem esse filtro, uma sessao
    "fantasma" (janela fechada ha muito tempo, processo nunca terminou de
    verdade) continuava aparecendo como se estivesse ativa."""
    try:
        target = os.readlink(f"/proc/{pid}/fd/0")
    except OSError:
        return False
    return target.startswith("/dev/pts/") and "(deleted)" not in target


def _running_pids_by_comm(comm_name):
    """pids (Linux, via /proc) cujo binario tem exatamente esse nome — usado
    pra achar processos de CLIs externas (ex: codex) rodando fora do app,
    sem depender de nenhuma lib de terceiros (psutil etc)."""
    pids = []
    try:
        for entry in Path("/proc").iterdir():
            if not entry.name.isdigit():
                continue
            if _proc_comm(int(entry.name)) == comm_name:
                pids.append(int(entry.name))
    except OSError:
        pass
    return pids


def _iso_to_ms(iso_str):
    if not iso_str:
        return None
    try:
        # Codex grava timestamps ISO8601 terminados em "Z" — datetime.fromisoformat
        # do Python so aceita "+00:00" nesse lugar, nao "Z" direto.
        return int(datetime.fromisoformat(iso_str.replace("Z", "+00:00")).timestamp() * 1000)
    except (ValueError, TypeError):
        return None


def _codex_rollout_meta_from_path(fpath):
    """Le so a PRIMEIRA linha (session_meta) do rollout — da cwd, session_id
    e timestamp de inicio sem carregar o transcript inteiro."""
    try:
        with fpath.open("r", encoding="utf-8") as f:
            first_line = f.readline()
        meta = json.loads(first_line)
    except (OSError, json.JSONDecodeError):
        return None
    payload = meta.get("payload") or {}
    payload["timestamp"] = payload.get("timestamp") or meta.get("timestamp")
    return payload


def _recent_codex_rollout_files(max_age_hours=48):
    """Rollouts candidatos a sessao VIVA agora — as pastas sao YYYY/MM/DD em
    UTC, entao olha hoje + ontem (cobre virada de meia-noite UTC) e devolve
    ordenado do mais recentemente MODIFICADO pro mais antigo. So um processo
    de verdade escrevendo naquele arquivo o mantem "recente" — e o sinal
    mais confiavel de "essa e a sessao ativa AGORA", bem melhor que
    session_index.jsonl (ver read_codex_sessions() pra saber o motivo)."""
    sessions_dir = CODEX_DIR / "sessions"
    if not sessions_dir.is_dir():
        return []
    now = datetime.utcnow()
    candidates = []
    for days_back in range(2):
        day = now - timedelta(days=days_back)
        day_dir = sessions_dir / f"{day.year:04d}" / f"{day.month:02d}" / f"{day.day:02d}"
        if day_dir.is_dir():
            candidates.extend(day_dir.glob("rollout-*.jsonl"))
    cutoff = time.time() - max_age_hours * 3600
    candidates = [p for p in candidates if p.stat().st_mtime >= cutoff]
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates


def read_codex_sessions():
    """Sessoes do Codex CLI rodando FORA do app (num terminal externo do
    usuario) — mesma ideia de read_sessions() pro Claude Code, mas pro
    Codex: casa processos `codex` vivos (via /proc) com o rollout mais
    RECENTEMENTE MODIFICADO daquele cwd, pra aparecer no grupo "external" da
    arvore (appManaged=False — ver groupOf() em SessionTree.tsx).

    NAO usa mais ~/.codex/session_index.jsonl pra casar sessao (so pra
    enfeitar o nome, se disponivel) — confirmado na pratica que esse indice
    demora a registrar sessoes bem novas (uma sessao recem-aberta podia
    ficar sem nenhuma entrada nele por varios minutos), o que fazia uma
    sessao nova nao aparecer, ou pior, "roubar" o card de uma sessao antiga
    que por coincidencia tinha o MESMO cwd ainda no indice.

    Sem sinal proprio de "status" gravado em disco (o Codex, ao contrario do
    Claude Code, nao escreve isso pra ninguem ler), usa "modificado ha
    pouco" como proxy grosseiro de "trabalhando agora"."""
    pids = [
        pid for pid in _running_pids_by_comm("codex")
        # "app-server" e a integracao com editor (ex: extensao do VS Code),
        # nao uma sessao de terminal interativa — nao deve virar card aqui.
        if "app-server" not in _proc_cmdline(pid) and _proc_has_live_tty(pid)
    ]
    if not pids:
        return []
    pid_cwds = {pid: cwd for pid in pids if (cwd := _proc_cwd(pid))}
    if not pid_cwds:
        return []

    rollout_files = _recent_codex_rollout_files()
    if not rollout_files:
        return []

    # nome amigavel: so cosmetico, busca no indice se ja existir uma entrada
    # pra essa sessao (pode nao existir ainda — ver docstring acima) — NUNCA
    # usado pra decidir qual sessao casa com qual processo.
    names_by_sid = {}
    index_path = CODEX_DIR / "session_index.jsonl"
    if index_path.exists():
        try:
            lines = index_path.read_text().splitlines()
        except OSError:
            lines = []
        for line in reversed(lines[-CODEX_INDEX_SCAN_LIMIT:]):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            sid = entry.get("id")
            if sid and sid not in names_by_sid and entry.get("thread_name"):
                names_by_sid[sid] = entry["thread_name"]

    sessions = []
    used_paths = set()
    now_ms = int(time.time() * 1000)
    for pid, cwd in pid_cwds.items():
        for fpath in rollout_files:
            if fpath in used_paths:
                continue
            payload = _codex_rollout_meta_from_path(fpath)
            if not payload or payload.get("cwd") != cwd:
                continue
            used_paths.add(fpath)
            sid = payload.get("session_id") or fpath.stem.rsplit("-", 1)[-1]
            started_ms = _iso_to_ms(payload.get("timestamp")) or now_ms
            updated_ms = int(fpath.stat().st_mtime * 1000)
            sessions.append({
                "pid": pid,
                "sessionId": sid,
                "cwd": cwd,
                "startedAt": started_ms,
                "updatedAt": updated_ms,
                "name": names_by_sid.get(sid) or sid[:8],
                "status": "busy" if (now_ms - updated_ms) < 15_000 else "idle",
                "alive": True,
                "appManaged": False,
                "appAgentId": None,
                "isSubagent": False,
                "parentSessionId": None,
                "llm": "codex",
                # ver resolve_transcript() e _stream_steps() — deixa o
                # rollout ja resolvido aqui, sem precisar re-globar por
                # sessionId toda vez que o loop de streaming olhar essa
                # sessao de novo.
                "_transcriptPath": str(fpath),
            })
            break
    return sessions


ANTIGRAVITY_DIR = Path.home() / ".gemini" / "antigravity-cli"


def _antigravity_uri_to_path(uri):
    # WorkspaceURIs vem como file:// URI (ex: "file:///home/tou/projeto"),
    # nao um path puro como o resto deste arquivo trabalha.
    if uri.startswith("file://"):
        return uri[len("file://"):]
    return uri


def read_antigravity_sessions():
    """Sessoes do Antigravity (Google, binario `agy`) rodando FORA do app —
    mesma ideia de read_codex_sessions(), casando processos `agy` vivos (via
    /proc) com a conversa mais recente daquele cwd em
    ~/.gemini/antigravity-cli/cache/conversation_metadata.json. Formato
    confirmado lendo o arquivo real nesta maquina: {"conversations": {"<id>":
    {"summary": {"Title", "Preview", "UpdatedAt", "WorkspaceURIs": [...]},
    "last_modified_time": ...}}} — sem sinal proprio de "status", mesmo
    proxy grosseiro de "atualizado ha pouco = trabalhando" do Codex."""
    meta_path = ANTIGRAVITY_DIR / "cache" / "conversation_metadata.json"
    if not meta_path.is_file():
        return []
    pids = [pid for pid in _running_pids_by_comm("agy") if _proc_has_live_tty(pid)]
    if not pids:
        return []
    pid_cwds = {pid: cwd for pid in pids if (cwd := _proc_cwd(pid))}
    if not pid_cwds:
        return []

    try:
        data = json.loads(meta_path.read_text())
    except (OSError, json.JSONDecodeError):
        return []
    conversations = data.get("conversations")
    if not isinstance(conversations, dict):
        return []

    sessions = []
    used_sids = set()
    now_ms = int(time.time() * 1000)
    for pid, cwd in pid_cwds.items():
        best = None
        for sid, item in conversations.items():
            if sid in used_sids or not isinstance(item, dict):
                continue
            summary = item.get("summary") or {}
            uris = summary.get("WorkspaceURIs") or []
            matches = any(
                isinstance(u, str) and _antigravity_uri_to_path(u) == cwd for u in uris
            )
            if not matches:
                continue
            updated_ms = _iso_to_ms(summary.get("UpdatedAt")) or _iso_to_ms(item.get("last_modified_time")) or now_ms
            if best is None or updated_ms > best[1]:
                best = (sid, updated_ms, summary)
        if not best:
            continue
        sid, updated_ms, summary = best
        used_sids.add(sid)
        sessions.append({
            "pid": pid,
            "sessionId": sid,
            "cwd": cwd,
            "startedAt": updated_ms,
            "updatedAt": updated_ms,
            "name": summary.get("Title") or summary.get("Preview") or sid[:8],
            "status": "busy" if (now_ms - updated_ms) < 15_000 else "idle",
            "alive": True,
            "appManaged": False,
            "appAgentId": None,
            "isSubagent": False,
            "parentSessionId": None,
            "llm": "agy",
        })
    return sessions


COPILOT_DIR = Path.home() / ".copilot"


def _parse_simple_yaml(text):
    # workspace.yaml do Copilot CLI e "chave: valor" sem aninhamento — nao
    # justifica puxar uma lib de YAML so pra isso (server.py e sem
    # dependencias externas de proposito).
    result = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, value = line.partition(":")
        result[key.strip()] = value.strip()
    return result


def read_copilot_sessions():
    """Sessoes do GitHub Copilot CLI rodando FORA do app. Ao contrario do
    Codex/Antigravity (que exigem casar processo vivo com cwd na unha), o
    Copilot CLI ja grava um lock `inuse.<pid>.lock` DENTRO da propria pasta
    da sessao (~/.copilot/session-state/<uuid>/) enquanto ela esta aberta —
    o pid no NOME do arquivo ja diz exatamente qual processo e dono de qual
    sessao, sem precisar adivinhar por cwd (confirmado lendo o disco real
    desta maquina com duas sessoes abertas em cwds diferentes ao mesmo
    tempo)."""
    state_dir = COPILOT_DIR / "session-state"
    if not state_dir.is_dir():
        return []
    sessions = []
    now_ms = int(time.time() * 1000)
    for lock_path in state_dir.glob("*/inuse.*.lock"):
        try:
            pid = int(lock_path.name.split(".")[1])
        except (ValueError, IndexError):
            continue
        if not pid_alive(pid) or not _proc_has_live_tty(pid):
            continue
        try:
            meta = _parse_simple_yaml((lock_path.parent / "workspace.yaml").read_text())
        except OSError:
            continue
        cwd = meta.get("cwd")
        if not cwd:
            continue
        started_ms = _iso_to_ms(meta.get("created_at")) or now_ms
        updated_ms = _iso_to_ms(meta.get("updated_at")) or started_ms
        sessions.append({
            "pid": pid,
            "sessionId": meta.get("id") or lock_path.parent.name,
            "cwd": cwd,
            "startedAt": started_ms,
            "updatedAt": updated_ms,
            "name": meta.get("repository") or Path(cwd).name,
            "status": "busy" if (now_ms - updated_ms) < 15_000 else "idle",
            "alive": True,
            "appManaged": False,
            "appAgentId": None,
            "isSubagent": False,
            "parentSessionId": None,
            "llm": "copilot",
        })
    return sessions


def _proc_start_ms(pid):
    # o mtime do proprio diretorio /proc/<pid> e atualizado na criacao do
    # processo (Linux) — proxy barato de "quando comecou" sem parsear
    # /proc/<pid>/stat (que exige somar com o boot time do sistema).
    try:
        return int(Path(f"/proc/{pid}").stat().st_mtime * 1000)
    except OSError:
        return None


def read_generic_external_sessions(comm, llm_id, exclude_cmdline_substrings=()):
    """Fallback GENERICO pra CLIs sem um arquivo de sessao proprio conhecido
    (ex: Gemini CLI — nao achamos um indice/lock confiavel de sessao ativa
    parecido com o do Codex/Antigravity/Copilot) — so casa processo vivo com
    esse `comm` exato e usa o cwd real (via /proc) como identidade. Sem nome
    de sessao "de verdade": usa o nome da pasta do projeto. Pior que uma
    leitura especifica, mas garante que a sessao pelo menos APARECE na
    arvore em vez de ficar invisivel."""
    pids = [
        pid for pid in _running_pids_by_comm(comm)
        if not any(s in _proc_cmdline(pid) for s in exclude_cmdline_substrings) and _proc_has_live_tty(pid)
    ]
    if not pids:
        return []
    now_ms = int(time.time() * 1000)
    sessions = []
    for pid in pids:
        cwd = _proc_cwd(pid)
        if not cwd:
            continue
        started_ms = _proc_start_ms(pid) or now_ms
        sessions.append({
            "pid": pid,
            "sessionId": f"{llm_id}-{pid}",
            "cwd": cwd,
            "startedAt": started_ms,
            "updatedAt": now_ms,
            "name": Path(cwd).name,
            "status": "idle",
            "alive": True,
            "appManaged": False,
            "appAgentId": None,
            "isSubagent": False,
            "parentSessionId": None,
            "llm": llm_id,
        })
    return sessions


def read_gemini_sessions():
    return read_generic_external_sessions("gemini", "gemini")


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
        # DESLIGADO: `bridgeSessionId` deixou de significar "controlada
        # remotamente AGORA" a partir do Claude Code 2.1.251 — confirmado
        # comparando sessoes reais nesta maquina: uma sessao v2.1.250 nao
        # tem essa chave no arquivo; uma sessao v2.1.251 (mesmo aberta so
        # localmente pelo app, sem NENHUM app remoto/mobile conectado) ja
        # nasce com bridgeSessionId preenchido. Ou seja, essa versao passou
        # a registrar o pareamento do DISPOSITIVO em toda sessao nova por
        # padrao — nao indica mais uma conexao ativa de verdade. Sem um sinal
        # melhor disponivel no arquivo de sessao pra distinguir "pareado" de
        # "conectado agora", mostrar a tag "remoto" baseado so nisso virou
        # sempre-verdadeiro (falso positivo universal) — desligado ate achar
        # um sinal confiavel de conexao ativa.
        data["remoteControl"] = False
        sessions.append(data)
    return _dedupe_sessions_by_id(sessions)


def _dedupe_sessions_by_id(sessions):
    """Um --resume/restart no MESMO terminal troca de PID mas herda o
    `sessionId` da conversa retomada; o arquivo de sessao antigo (PID
    anterior, que pode continuar de pe por um tempo) nao e removido, entao
    ~/.claude/sessions/ passa a ter DOIS arquivos *.json com o mesmo
    sessionId. Sem essa dedupe, essa MESMA conversa virava DOIS nos-raiz na
    arvore (mesmo sessionId, `parentSessionId` None nos dois) e cada
    subagente/MCP/skill dela era calculado (e duplicado) uma vez por raiz em
    do_GET — ver MEMORY.md. Mantem so a entrada mais recente (updatedAt, com
    startedAt de desempate) por sessionId; sessoes sem sessionId (nao deveria
    acontecer, mas por seguranca) sao mantidas como estao."""
    best_by_id = {}
    result = []
    for data in sessions:
        sid = data.get("sessionId")
        if not sid:
            result.append(data)
            continue
        current = best_by_id.get(sid)
        if current is None:
            best_by_id[sid] = data
            continue
        current_key = (current.get("updatedAt") or 0, current.get("startedAt") or 0)
        new_key = (data.get("updatedAt") or 0, data.get("startedAt") or 0)
        if new_key > current_key:
            best_by_id[sid] = data
    result.extend(best_by_id.values())
    return result


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
    # agent_id -> (parent_mtime, fpath, mtime, parent_session_id) da copia
    # escolhida como "dona" quando o mesmo agent_id aparece em mais de uma
    # pasta <sessionId-pai>/subagents/ (ver comentario abaixo).
    candidates = {}
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
        try:
            parent_mtime = parent_transcript.stat().st_mtime
        except OSError:
            parent_mtime = 0
        # Um /fork (ou resume) pode duplicar o historico inteiro de uma sessao
        # pai, inclusive a pasta subagents/ inteira, criando uma copia FISICA
        # do mesmo agent-<agentId>.jsonl sob um sessionId-pai diferente. Sem
        # essa dedupe, o mesmo subagente virava filho de DOIS pais distintos
        # na arvore (mesmo sessionId sintetico, dois parentSessionId) — ver
        # MEMORY.md. Mantem so a copia cujo transcript-pai teve atividade mais
        # recente: essa e a linhagem viva; a outra ficou parada no passado (o
        # fork/resume que nao continuou).
        existing = candidates.get(agent_id)
        if existing is None or parent_mtime > existing[0]:
            candidates[agent_id] = (parent_mtime, fpath, mtime, parent_session_id)

    for agent_id, (_parent_mtime, fpath, mtime, parent_session_id) in candidates.items():
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


PRICING_PATH = Path.home() / ".claude" / "tools" / "precos-modelos.json"
_PRICING_CACHE = None


def _load_pricing():
    """Tabela de preco por modelo (USD por 1M tokens) e cotacao USD->BRL de
    fallback — mesma fonte que a skill cost-report do orquestrador usa. Se o
    arquivo nao existir nesta maquina, cai num preco generico razoavel: o
    relatorio de custo fica menos preciso, mas nao quebra."""
    global _PRICING_CACHE
    if _PRICING_CACHE is not None:
        return _PRICING_CACHE
    fallback = {
        "usd_brl_fallback": 5.09,
        "modelos": {},
        "default": {"input": 3.0, "output": 15.0, "cache_read": 0.3, "cache_write": 3.75},
    }
    try:
        _PRICING_CACHE = json.loads(PRICING_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        _PRICING_CACHE = fallback
    return _PRICING_CACHE


def _price_for_model(model):
    pricing = _load_pricing()
    modelos = pricing.get("modelos") or {}
    return modelos.get(model) or pricing.get("default") or {}


_USAGE_CACHE = {}  # caminho do transcript (str) -> (mtime, {tokens/custo acumulados})


def _scan_transcript_usage(fpath):
    """Soma tokens e custo estimado (USD) de TODAS as mensagens do assistente
    num transcript inteiro. Diferente dos outros scans deste arquivo (que so
    leem o RABO pra achar o estado mais recente), o relatorio de custo
    precisa do historico inteiro da sessao — por isso so reprocessa o
    arquivo quando o mtime muda, reaproveitando o total cacheado entre polls."""
    try:
        mtime = fpath.stat().st_mtime
    except OSError:
        return None
    cache_key = str(fpath)
    cached = _USAGE_CACHE.get(cache_key)
    if cached and cached[0] == mtime:
        return cached[1]

    input_tokens = output_tokens = cache_read_tokens = cache_write_tokens = 0
    cost_usd = 0.0
    try:
        with fpath.open("r", errors="ignore") as f:
            for line in f:
                try:
                    d = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if d.get("type") != "assistant":
                    continue
                message = d.get("message") or {}
                usage = message.get("usage") or {}
                if not usage:
                    continue
                price = _price_for_model(message.get("model") or "")
                inp = usage.get("input_tokens") or 0
                out = usage.get("output_tokens") or 0
                cread = usage.get("cache_read_input_tokens") or 0
                cwrite = usage.get("cache_creation_input_tokens") or 0
                input_tokens += inp
                output_tokens += out
                cache_read_tokens += cread
                cache_write_tokens += cwrite
                cost_usd += (
                    inp * (price.get("input") or 0)
                    + out * (price.get("output") or 0)
                    + cread * (price.get("cache_read") or price.get("input") or 0)
                    + cwrite * (price.get("cache_write") or price.get("input") or 0)
                ) / 1_000_000
    except OSError:
        return None

    result = {
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "cacheReadTokens": cache_read_tokens,
        "cacheWriteTokens": cache_write_tokens,
        "costUsd": cost_usd,
    }
    _USAGE_CACHE[cache_key] = (mtime, result)
    return result


def read_cost_summary():
    """Agrega tokens/custo de TODAS as sessoes conhecidas no momento (reais +
    subagentes ativos) — mesmo escopo de sessoes que /api/state expoe na
    arvore, entao o numero bate com o que o usuario ve nos cards. Tambem monta
    o detalhamento POR SESSAO (perSession), pra cada card poder mostrar so o
    proprio custo/consumo, alem do agregado geral."""
    # sessionId -> caminho do transcript — 1:1 (cada sessao/subagente tem seu
    # proprio arquivo), diferente do dedup por fpath usado antes so pra
    # proteger o total contra sessao fisicamente duplicada (ver read_sessions).
    session_paths = {}
    for s in read_sessions():
        fpath = transcript_path(s.get("cwd", ""), s.get("sessionId", ""))
        if fpath:
            session_paths[s["sessionId"]] = fpath
    for s in find_subagent_transcripts():
        known_path = s.get("_transcriptPath")
        if known_path:
            session_paths[s["sessionId"]] = Path(known_path)

    pricing = _load_pricing()
    usd_brl = pricing.get("usd_brl_fallback") or 5.09

    totals = {"inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0, "cacheWriteTokens": 0, "costUsd": 0.0}
    per_session = {}
    seen_paths = set()
    for session_id, fpath in session_paths.items():
        usage = _scan_transcript_usage(fpath)
        if not usage:
            continue
        session_tokens = (
            usage["inputTokens"] + usage["outputTokens"] + usage["cacheReadTokens"] + usage["cacheWriteTokens"]
        )
        per_session[session_id] = {
            "tokensTotal": session_tokens,
            "costUsd": usage["costUsd"],
            "costBrl": usage["costUsd"] * usd_brl,
        }
        # o agregado geral ainda deduplica por arquivo fisico — uma sessao
        # duplicada (bug ja corrigido, mas defensivo) nao deve contar 2x no
        # total, mesmo que apareca 2x no detalhamento por sessao.
        if str(fpath) in seen_paths:
            continue
        seen_paths.add(str(fpath))
        for key in ("inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"):
            totals[key] += usage[key]
        totals["costUsd"] += usage["costUsd"]

    totals["costBrl"] = totals["costUsd"] * usd_brl
    totals["tokensTotal"] = (
        totals["inputTokens"] + totals["outputTokens"] + totals["cacheReadTokens"] + totals["cacheWriteTokens"]
    )
    totals["perSession"] = per_session
    return totals


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


def parse_codex_step(raw_line):
    """Equivalente a parse_step(), mas pro formato de rollout do Codex CLI
    (~/.codex/sessions/**/rollout-*.jsonl) — bem diferente do transcript do
    Claude Code: cada linha e {"timestamp":..., "type": "response_item"|
    "event_msg"|..., "payload": {...}}. So "response_item" tem conteudo de
    conversa de verdade; os outros tipos (event_msg, turn_context,
    session_meta, world_state) sao progresso/metadado interno, sem
    equivalente no card de "passos" — ignorados aqui."""
    try:
        d = json.loads(raw_line)
    except json.JSONDecodeError:
        return []
    if d.get("type") != "response_item":
        return []
    payload = d.get("payload") or {}
    ptype = payload.get("type")
    ts = d.get("timestamp")
    steps = []

    if ptype == "message":
        role = payload.get("role")
        content = payload.get("content")
        text = ""
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict):
                    text += item.get("text", "")
        text = text.strip()
        if text:
            if role == "user":
                steps.append({"kind": "prompt", "text": truncate(text, MAX_TEXT_LEN, collapse_newlines=False), "ts": ts})
            elif role == "assistant":
                steps.append({"kind": "text", "text": truncate(text, MAX_TEXT_LEN, collapse_newlines=False), "ts": ts})

    elif ptype == "function_call":
        name = payload.get("name") or "tool"
        detail = ""
        try:
            args = json.loads(payload.get("arguments") or "{}")
        except json.JSONDecodeError:
            args = None
        if isinstance(args, dict):
            detail = args.get("cmd") or args.get("command") or args.get("path") or ""
            if not detail:
                for v in args.values():
                    if isinstance(v, str):
                        detail = v
                        break
        steps.append({"kind": "tool", "name": name, "text": truncate(detail, MAX_TOOL_DETAIL_LEN), "ts": ts})

    elif ptype == "custom_tool_call":
        name = payload.get("name") or "tool"
        inp = payload.get("input")
        detail = inp if isinstance(inp, str) else json.dumps(inp) if inp else ""
        steps.append({"kind": "tool", "name": name, "text": truncate(detail, MAX_TOOL_DETAIL_LEN), "ts": ts})
    # function_call_output / custom_tool_call_output / reasoning / web_search_call:
    # ruido demais (ou redundante com o texto do assistente que ja vem
    # depois) — ignorados, mesmo criterio do tool_result do parse_step().

    return steps


def _parser_for_session(session):
    """Cada CLI externa grava o transcript num formato proprio — despacha
    pro parser certo com base no `llm` da sessao (ver read_codex_sessions()
    etc.). Sem entrada aqui (Claude Code, ou uma CLI sem leitura de
    transcript implementada ainda) cai no parser do Claude por padrao, que
    so retorna [] pra um arquivo que nao bate no formato dele."""
    if session.get("llm") == "codex":
        return parse_codex_step
    return parse_step


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
    # Antigravity (Google) — o binario se chama "agy", nao "antigravity". Sem
    # comando de instalacao verificado (nao achamos um instalador oficial de
    # 1 linha documentado) — deixa em branco de proposito em vez de arriscar
    # sugerir um curl|bash pra um dominio nao confirmado. O login tambem nao
    # tem subcomando dedicado: rodar o binario sem argumentos ja dispara o
    # fluxo OAuth interativo na primeira vez (mesmo padrao do "gemini").
    {"id": "antigravity", "name": "Antigravity", "bin": "agy", "vendor": "Google", "install": "", "login": "agy", "logout": ""},
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


_ANTIGRAVITY_AUTH_CACHE = {"checkedAt": 0.0, "value": False}
ANTIGRAVITY_AUTH_CACHE_TTL = 30.0


def _antigravity_authenticated():
    """Antigravity (`agy`) guarda o token OAuth no keyring do proprio SO
    (Secret Service no Linux, Keychain no macOS, Credential Manager no
    Windows) — nao ha arquivo de credencial pra ler direto, e este backend
    nao usa nenhuma lib externa (nem de keyring) de proposito. Em vez disso
    pergunta pro proprio binario: `agy models` so lista os modelos com um
    token valido, e falha rapido sem um. Cacheado por
    ANTIGRAVITY_AUTH_CACHE_TTL pra nao rodar esse processo (que bate na rede)
    a cada poll de /api/llms."""
    now = time.time()
    if now - _ANTIGRAVITY_AUTH_CACHE["checkedAt"] < ANTIGRAVITY_AUTH_CACHE_TTL:
        return _ANTIGRAVITY_AUTH_CACHE["value"]
    ok = False
    exe = _resolve_bin("agy")
    if exe:
        try:
            result = subprocess.run([exe, "models"], capture_output=True, timeout=6)
            ok = result.returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            ok = False
    _ANTIGRAVITY_AUTH_CACHE.update({"checkedAt": now, "value": ok})
    return ok


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


def _nvm_bin_dirs():
    """Todo `bin/` de versao de node instalada via nvm — usado pra achar
    CLIs instaladas com `npm install -g` (Codex, Gemini, Copilot, OpenCode,
    Amp: todas KNOWN_LLM_CLIS documentam instalacao via npm) quando o app
    empacotado e aberto pelo icone/launcher do SO (PATH minimo, sem nvm
    sourceado — nunca herda o PATH de um shell interativo). Devolve TODAS
    as versoes instaladas (nao so a "default"), pra nao depender de como
    ~/.nvm/alias/default esta escrito (pode ser um alias tipo "lts/*", nao
    necessariamente um numero de versao direto)."""
    nvm_versions_dir = Path.home() / ".nvm" / "versions" / "node"
    if not nvm_versions_dir.is_dir():
        return []
    return [str(p / "bin") for p in nvm_versions_dir.iterdir() if (p / "bin").is_dir()]


def _path_dirs_with_user_bins():
    # complementa o PATH herdado com os diretorios de binario de usuario mais
    # comuns — o app empacotado (ver commit "Fix agents never starting when
    # the packaged app inherits a minimal PATH") pode herdar um PATH minimo
    # do SO que nao inclui esses diretorios mesmo com a CLI instalada ali.
    home = str(Path.home())
    path_dirs = os.environ.get("PATH", "").split(os.pathsep)
    for d in (
        f"{home}/.local/bin",
        f"{home}/bin",
        "/usr/local/bin",
        "/opt/homebrew/bin",
        *_nvm_bin_dirs(),
    ):
        if d not in path_dirs:
            path_dirs.insert(0, d)
    return [p for p in path_dirs if p]


def _resolve_bin(name):
    """Caminho completo de um binario, procurando nos mesmos diretorios de
    _path_dirs_with_user_bins() — necessario pra qualquer subprocess.run()
    que precise achar uma CLI de usuario (`agy`, `codex`, etc) por NOME,
    ja que subprocess.run(["nome", ...]) sem `env=` faz a busca usando o
    PATH herdado de verdade do processo (que pode ser o minimo do SO
    empacotado), nao a lista corrigida acima."""
    for d in _path_dirs_with_user_bins():
        candidate = Path(d) / name
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


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
    "antigravity": _antigravity_authenticated,
}


_CLAUDE_USAGE_CACHE = {"fetchedAt": 0.0, "value": None}
CLAUDE_USAGE_CACHE_TTL = 60.0


def _extract_claude_token_from_secret(secret):
    if not secret:
        return None
    try:
        data = json.loads(secret)
    except json.JSONDecodeError:
        return secret
    token = (
        (data.get("claudeAiOauth") or {}).get("accessToken")
        if isinstance(data, dict)
        else None
    )
    return token or secret


def _read_claude_credentials_token(path):
    # Claude pode estar regravando esse arquivo no mesmo momento; tenta de novo
    # rapidamente antes de desistir para evitar falsos "sem token".
    for attempt in range(3):
        if attempt:
            time.sleep(0.08)
        try:
            secret = path.read_text()
        except OSError:
            continue
        token = _extract_claude_token_from_secret(secret)
        if token:
            return token
    return None


def _read_macos_claude_keychain_token():
    if sys.platform != "darwin":
        return None
    usernames = []
    for key in ("USER", "USERNAME"):
        value = os.environ.get(key)
        if value:
            usernames.append(value)
    usernames.extend(["default", "user", "claude", ""])
    seen = set()
    for username in usernames:
        if username in seen:
            continue
        seen.add(username)
        cmd = ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"]
        if username:
            cmd.extend(["-a", username])
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=2)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if proc.returncode == 0:
            token = _extract_claude_token_from_secret(proc.stdout.strip())
            if token:
                return token
    return None


def _discover_claude_oauth_token():
    token = os.environ.get("CLAUDE_OAUTH_TOKEN")
    if token:
        return token
    token = _read_claude_credentials_token(CLAUDE_DIR / ".credentials.json")
    if token:
        return token
    return _read_macos_claude_keychain_token()


def _parse_claude_usage_window(body, key):
    obj = body.get(key)
    if not isinstance(obj, dict):
        return None
    return {
        "utilization": obj.get("utilization") if isinstance(obj.get("utilization"), (int, float)) else 0,
        "resetsAt": obj.get("resets_at") if isinstance(obj.get("resets_at"), str) else None,
    }


def _fetch_claude_usage_live(token):
    req = urllib.request.Request(
        "https://api.anthropic.com/api/oauth/usage",
        headers={
            "Authorization": f"Bearer {token}",
            "anthropic-beta": "oauth-2025-04-20",
            "User-Agent": "claude-sessions-dashboard",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=8) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    five_hour = _parse_claude_usage_window(body, "five_hour") or {"utilization": 0, "resetsAt": None}
    seven_day = _parse_claude_usage_window(body, "seven_day") or {"utilization": 0, "resetsAt": None}
    return {
        "fiveHour": five_hour,
        "sevenDay": seven_day,
        "opus": _parse_claude_usage_window(body, "seven_day_opus"),
        "fetchedAtMs": int(time.time() * 1000),
        "source": "anthropic",
    }


def _read_claude_usage_from_local_cache():
    """Fallback para o cache que a propria CLI grava em ~/.claude.json."""
    try:
        cfg = json.loads((Path.home() / ".claude.json").read_text())
    except (OSError, json.JSONDecodeError):
        return None
    cached = cfg.get("cachedUsageUtilization") or {}
    fetched_at_ms = cached.get("fetchedAtMs")
    util = cached.get("utilization") or {}
    five_hour = util.get("five_hour") or {}
    seven_day = util.get("seven_day") or {}
    # quota semanal especifica do Opus — so populada em algumas contas/planos;
    # None (nao {}) quando a propria CLI nao rastreia isso, pra o frontend
    # distinguir "0% de uso" de "essa conta nem tem esse limite".
    seven_day_opus = util.get("seven_day_opus")
    if not five_hour and not seven_day:
        return None
    return {
        "fiveHour": {"utilization": five_hour.get("utilization"), "resetsAt": five_hour.get("resets_at")},
        "sevenDay": {"utilization": seven_day.get("utilization"), "resetsAt": seven_day.get("resets_at")},
        "opus": (
            {"utilization": seven_day_opus.get("utilization"), "resetsAt": seven_day_opus.get("resets_at")}
            if seven_day_opus
            else None
        ),
        # quando a PROPRIA CLI atualizou esse cache pela ultima vez — nao
        # existe consulta ao vivo aqui (nem em lugar nenhum deste backend);
        # o numero so muda quando o `claude` decide reescrever esse arquivo
        # por conta propria. Exibir essa idade evita prometer "tempo real"
        # que este backend nao tem como entregar.
        "fetchedAtMs": fetched_at_ms,
        "source": "claude-cache",
    }


def read_claude_usage(force=False):
    """Uso/quota real do Claude via API OAuth da Anthropic.

    Porta o mesmo mecanismo do Alethe: reutiliza o token OAuth local do Claude
    Code, consulta /api/oauth/usage e mantem o token restrito ao backend local.
    Se a rede/API falhar, conserva o ultimo valor live conhecido ou cai no
    cache local antigo do Claude CLI."""
    now = time.time()
    if not force and _CLAUDE_USAGE_CACHE["value"] and now - _CLAUDE_USAGE_CACHE["fetchedAt"] < CLAUDE_USAGE_CACHE_TTL:
        return _CLAUDE_USAGE_CACHE["value"]

    token = _discover_claude_oauth_token()
    if token:
        try:
            value = _fetch_claude_usage_live(token)
            _CLAUDE_USAGE_CACHE.update({"fetchedAt": now, "value": value})
            return value
        except (OSError, urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
            if _CLAUDE_USAGE_CACHE["value"]:
                return _CLAUDE_USAGE_CACHE["value"]

    value = _read_claude_usage_from_local_cache()
    if value:
        _CLAUDE_USAGE_CACHE.update({"fetchedAt": now, "value": value})
    return value


_CODEX_USAGE_CACHE = {"fetchedAt": 0.0, "value": None}
CODEX_USAGE_CACHE_TTL = 60.0


def _resolve_codex_bin():
    return _resolve_bin("codex")


def _parse_codex_usage_window(obj):
    if not isinstance(obj, dict):
        return {"usedPercent": 0, "windowMinutes": 0, "resetsAtMs": 0}
    resets_at = obj.get("resetsAt")
    return {
        "usedPercent": obj.get("usedPercent") if isinstance(obj.get("usedPercent"), (int, float)) else 0,
        "windowMinutes": obj.get("windowDurationMins") if isinstance(obj.get("windowDurationMins"), int) else 0,
        # O app-server do Codex retorna epoch em segundos; o frontend trabalha em ms.
        "resetsAtMs": resets_at * 1000 if isinstance(resets_at, (int, float)) else 0,
    }


def _fetch_codex_usage_live():
    """Uso/quota real do Codex CLI — ao contrario do Claude (API OAuth REST
    documentada), o Codex so expoe isso via JSON-RPC no proprio `codex
    app-server` (stdin/stdout). Sobe o processo, manda initialize +
    account/rateLimits/read, le so a resposta com id=2 e mata o processo —
    nao deixamos um app-server pendurado rodando pra sempre so pra essa
    consulta pontual."""
    exe = _resolve_codex_bin()
    if not exe:
        raise OSError("codex_not_found")
    proc = subprocess.Popen(
        [exe, "app-server"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    out_queue = queue.Queue()

    def read_stdout():
        try:
            for line in proc.stdout:
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if data.get("id") == 2:
                    out_queue.put(data)
                    return
        finally:
            out_queue.put(None)

    reader = threading.Thread(target=read_stdout, daemon=True)
    reader.start()
    requests = (
        '{"id":1,"method":"initialize","params":{"clientInfo":{"name":"orbit","version":"1.0.1"}}}\n'
        '{"method":"initialized"}\n'
        '{"id":2,"method":"account/rateLimits/read"}\n'
    )
    try:
        proc.stdin.write(requests)
        proc.stdin.flush()
        message = out_queue.get(timeout=12)
        if not message:
            raise TimeoutError("codex_usage_timeout")
        if message.get("error"):
            raise OSError(f"codex_rpc_error: {message.get('error')}")
        result = message.get("result") or {}
        rate_limits = result.get("rateLimits")
        if not isinstance(rate_limits, dict):
            raise OSError("codex_no_rate_limits")
        limited_type = rate_limits.get("rateLimitReachedType")
        reset_credits = result.get("rateLimitResetCredits") or {}
        return {
            "primary": _parse_codex_usage_window(rate_limits.get("primary")),
            "secondary": _parse_codex_usage_window(rate_limits.get("secondary")),
            "plan": rate_limits.get("planType") if isinstance(rate_limits.get("planType"), str) else "",
            "rateLimited": limited_type is not None,
            "resetCredits": reset_credits.get("availableCount") if isinstance(reset_credits.get("availableCount"), int) else 0,
            "fetchedAtMs": int(time.time() * 1000),
            "source": "codex-app-server",
        }
    finally:
        try:
            if proc.stdin:
                proc.stdin.close()
        except OSError:
            pass
        try:
            proc.kill()
        except OSError:
            pass
        try:
            proc.wait(timeout=2)
        except (OSError, subprocess.TimeoutExpired):
            pass


def read_codex_usage(force=False):
    now = time.time()
    if not force and _CODEX_USAGE_CACHE["value"] and now - _CODEX_USAGE_CACHE["fetchedAt"] < CODEX_USAGE_CACHE_TTL:
        return _CODEX_USAGE_CACHE["value"]
    try:
        value = _fetch_codex_usage_live()
        _CODEX_USAGE_CACHE.update({"fetchedAt": now, "value": value})
        return value
    except (OSError, TimeoutError):
        return _CODEX_USAGE_CACHE["value"]


def read_llm_clis():
    result = []
    path_dirs = _path_dirs_with_user_bins()
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
            # sessoes de OUTRAS CLIs (Codex, Antigravity, Copilot, Gemini)
            # rodando fora do app — mesmo grupo "external" das sessoes do
            # Claude Code lidas acima, so que descobertas via processo vivo
            # + arquivo/lock de sessao proprio da CLI, ja que elas nunca
            # escrevem em ~/.claude/sessions/*.json.
            sessions += read_codex_sessions()
            sessions += read_antigravity_sessions()
            sessions += read_copilot_sessions()
            sessions += read_gemini_sessions()
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
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            force = (params.get("force") or [""])[0] in ("1", "true", "yes")
            self._send_json({
                "claude": read_claude_usage(force=force),
                "claudeAuthenticated": _claude_authenticated() or bool(_discover_claude_oauth_token()),
                "codex": read_codex_usage(force=force),
            })
            return

        if self.path.startswith("/api/cost-summary"):
            self._send_json(read_cost_summary())
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
                for s in read_sessions() + subagent_list + read_codex_sessions()
                if s.get("alive")
            }
            for sid, s in sessions.items():
                fpath = resolve_transcript(s)
                if not fpath:
                    continue
                parser = _parser_for_session(s)
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
                        collected.extend(parser(line))
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
                    for s in read_sessions() + subagent_list + read_codex_sessions()
                    if s.get("alive")
                }
                for sid, s in sessions.items():
                    fpath = resolve_transcript(s)
                    if not fpath:
                        continue
                    parser = _parser_for_session(s)
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
                                collected.extend(parser(line))
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
                            for step in parser(line):
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
