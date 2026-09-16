import type { SessionInfo } from '../../../api';

export type RobotVariant = 'claude' | 'codex' | 'neutral';

export const agentIdentity = (session: SessionInfo): { variant: RobotVariant; provider: string; model: string } => {
  const llm = (session.llm || '').toLowerCase();
  const model = session.model || '';
  const variant = llm.includes('codex') || (!llm && /gpt|codex/i.test(model)) ? 'codex'
    : llm.includes('claude') || (!llm && (!model || /claude|opus|sonnet|haiku/i.test(model))) ? 'claude' : 'neutral';
  return { variant, provider: variant === 'claude' ? 'Claude' : variant === 'codex' ? 'Codex' : session.llm || 'Agente', model };
};
