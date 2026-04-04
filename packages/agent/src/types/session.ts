export interface StoredMessage {
  id: string;
  sessionId: string;
  roomId: string;
  entityId: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
}

export interface SessionSearchResult {
  sessionId: string;
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}

export interface SessionSummary {
  sessionId: string;
  title?: string;
  continuityKey?: string;
  messageCount: number;
  startedAt?: string;
  endedAt?: string;
  participants: Array<"user" | "assistant" | "system">;
  preview: string[];
}

export interface SessionUsageSummary {
  sessionId: string;
  title?: string;
  continuityKey?: string;
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  systemMessages: number;
  startedAt?: string;
  endedAt?: string;
  characterCount: number;
  estimatedTokens: number;
  lastPreview?: string;
}
