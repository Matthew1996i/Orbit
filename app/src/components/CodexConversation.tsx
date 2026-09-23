import { AgentConversation } from './AgentConversation';
import { useCodexConversation } from './useCodexConversation';

const CodexConversation = ({ agentId }: { agentId: string }) => {
  const controller = useCodexConversation(agentId);
  return <AgentConversation conversationKey={agentId} controller={controller} />;
};

export default CodexConversation;
