import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { IonPage } from '@ionic/react';
import { Minus, X } from 'lucide-react';
import TerminalPanel from '../components/TerminalPanel';
import { SessionInfo, StepEvent, connectStepStream, fetchState } from '../api';
import '../components/TitleBar.css';
import './SessionWindow.css';

const MAX_BUFFER_STEPS = 300;

// barra de titulo customizada da janela destacada — a janela nasce
// frame:false (igual a principal, ver open-session-window no processo
// principal do Electron), entao o SO nao desenha nada sozinho; "externo -"
// no titulo deixa claro de longe que essa janela e uma sessao destacada,
// nao a janela principal do app. Reaproveita as classes de TitleBar.css
// (mesmo visual dos botoes de janela) mas e um componente bem mais simples
// (sem menu, sem sidebar) — nao faz sentido portar TitleBar.tsx inteiro.
function PopoutTitleBar({ title }: { title: string }) {
  // sem botao de maximizar: a janela destacada nasce com resizable:false
  // (tamanho fixo 920x619, ver open-session-window no processo principal) —
  // maximizar nao faz sentido pra uma janela que nao redimensiona.
  return (
    <div className="title-bar">
      <div className="title-bar-drag">
        <span className="title-bar-name">externo — {title}</span>
      </div>
      <div className="title-bar-window-controls">
        <button
          className="title-bar-btn"
          onClick={() => window.dashboardAPI?.windowMinimize()}
          aria-label="Minimizar"
        >
          <Minus size={14} />
        </button>
        <button
          className="title-bar-btn title-bar-btn-close"
          onClick={() => window.dashboardAPI?.windowClose()}
          aria-label="Fechar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// conteudo de uma janela OS DEDICADA a UMA sessao (aberta via o botao
// "destacar" do TerminalPanel — ver onPopout em Home.tsx e o handler
// 'open-session-window' no processo principal do Electron). E uma pagina
// separada (rota propria) porque essa janela roda um processo de renderer
// Electron proprio, sem nenhum estado compartilhado com a janela principal —
// precisa buscar/assinar os dados da sessao de novo, do zero, do mesmo jeito
// que o Home.tsx faz pro dashboard inteiro, so que filtrado pra UMA sessao.
export default function SessionWindow() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [replayVersion, setReplayVersion] = useState(0);
  const buffersRef = useRef<Map<string, StepEvent[]>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const data = await fetchState();
      setSessions(data.sessions);
    } catch {
      /* backend indisponivel nesse ciclo — mantem a ultima lista conhecida */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const disconnect = connectStepStream((step) => {
      if (!step.sessionId || step.sessionId !== sessionId) return;
      let buf = buffersRef.current.get(step.sessionId);
      if (!buf) {
        buf = [];
        buffersRef.current.set(step.sessionId, buf);
      }
      buf.push(step);
      if (buf.length > MAX_BUFFER_STEPS) buf.splice(0, buf.length - MAX_BUFFER_STEPS);
      if (!step.backlog) setReplayVersion((v) => v + 1);
    });
    return disconnect;
  }, [sessionId]);

  const session = sessions.find((s) => s.sessionId === sessionId);
  const title = session?.name || sessionId?.slice(0, 8) || '…';

  // o titulo NATIVO da janela (usado na barra de tarefas/alt-tab, mesmo sem
  // moldura do SO visivel) segue `document.title` automaticamente — o
  // Electron atualiza sozinho via `page-title-updated`, sem precisar de IPC.
  useEffect(() => {
    document.title = `externo — ${title}`;
  }, [title]);

  // copia nova a cada render (mesmo motivo do Home.tsx): o buffer e mutado no
  // lugar (push), entao passar a MESMA referencia faria o useMemo do
  // TranscriptView nunca perceber que chegou conteudo novo.
  const steps = session?.appManaged ? [] : [...(buffersRef.current.get(sessionId || '') || [])];

  return (
    <IonPage>
      <div className="session-window-body">
        <PopoutTitleBar title={title} />
        {session ? (
          <TerminalPanel
            session={session}
            allSessions={sessions}
            replaySteps={steps}
            minimized={false}
            zIndex={1}
            popout
            onClose={() => window.dashboardAPI?.windowClose()}
            onMinimize={() => {}}
            onFocus={() => {}}
          />
        ) : (
          <div className="session-window-empty">
            {sessions.length === 0 ? 'Conectando…' : 'Essa sessão não está mais disponível.'}
          </div>
        )}
      </div>
    </IonPage>
  );
}
