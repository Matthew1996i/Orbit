import { startVisiblePolling } from '../utils/visiblePolling';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { IonPage } from '@ionic/react';
import TerminalPanel from '../components/TerminalPanel';
import { SessionInfo, StepEvent, connectStepStream, fetchState } from '../api';
import './SessionWindow.css';

const MAX_BUFFER_STEPS = 300;

// conteudo de uma janela OS DEDICADA a UMA sessao (aberta via o botao
// "destacar" do TerminalPanel — ver onPopout em Home.tsx e o handler
// 'open-session-window' no processo principal do Electron). E uma pagina
// separada (rota propria) porque essa janela roda um processo de renderer
// Electron proprio, sem nenhum estado compartilhado com a janela principal —
// precisa buscar/assinar os dados da sessao de novo, do zero, do mesmo jeito
// que o Home.tsx faz pro dashboard inteiro, so que filtrado pra UMA sessao.
const SessionWindow = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [, setReplayVersion] = useState(0);
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
    return startVisiblePolling(refresh, 2000);
  }, [refresh]);

  useEffect(() => {
    let replayTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReplay = () => {
      if (replayTimer !== undefined) return;
      replayTimer = setTimeout(() => {
        replayTimer = undefined;
        setReplayVersion((version) => version + 1);
      }, 100);
    };
    const disconnect = connectStepStream((step) => {
      if (!step.sessionId || step.sessionId !== sessionId) return;
      let buf = buffersRef.current.get(step.sessionId);
      if (!buf) {
        buf = [];
        buffersRef.current.set(step.sessionId, buf);
      }
      buf.push(step);
      if (buf.length > MAX_BUFFER_STEPS) buf.splice(0, buf.length - MAX_BUFFER_STEPS);
      if (!step.backlog) scheduleReplay();
    }, sessionId);
    return () => {
      clearTimeout(replayTimer);
      disconnect();
    };
  }, [sessionId]);

  const session = sessions.find((s) => s.sessionId === sessionId);
  const title = session?.name || sessionId?.slice(0, 8) || '…';

  // O titulo nativo continua identificando a sessao no Dock e no alternador
  // de janelas. A barra visivel e a mesma do terminal dentro do app.
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
};

export default SessionWindow;
