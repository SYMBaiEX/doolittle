type RlTurnMessageRole = "user" | "assistant" | "system";

export interface RlTurnMessage {
  role: RlTurnMessageRole;
  content: string;
}

export interface RlTurnRecord {
  id: string;
  sessionId: string;
  model: string;
  provider: string;
  agentName: string;
  createdAt: string;
  messages: RlTurnMessage[];
  response: string;
  metadata?: {
    turnIndex: number;
    windowSize: number;
    sessionMessageCount: number;
  };
}

export interface RlTurnBuilderOptions {
  model?: string;
  provider?: string;
  agentName?: string;
  windowSize: number;
  includeMetadata?: boolean;
}
