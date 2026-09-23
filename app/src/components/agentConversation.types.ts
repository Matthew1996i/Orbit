export type ConversationEntry = {
  id: string;
  kind: 'user' | 'assistant' | 'activity' | 'error';
  text: string;
  title?: string;
  status?: string;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export type ConversationModel = { id: string; label: string; efforts: string[] };

export type ConversationSettings = {
  models: ConversationModel[];
  model: string;
  effort: string;
  setModel: (model: string) => void;
  setEffort: (effort: string) => void;
};

export type ConversationController = {
  entries: ConversationEntry[];
  connection: ConnectionStatus;
  busy: boolean;
  stopping: boolean;
  sendPrompt: (text: string) => boolean;
  interrupt: () => void;
  reconnect: () => void;
  settings?: ConversationSettings;
};
