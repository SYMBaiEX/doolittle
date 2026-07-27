export interface StoredMessageAttachment {
  id: string;
  name: string;
  kind: "audio" | "document" | "image" | "video";
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface StoredMessage {
  id: string;
  sessionId: string;
  roomId: string;
  entityId: string;
  role: "user" | "assistant" | "system";
  text: string;
  attachments?: StoredMessageAttachment[];
  createdAt: string;
}

export interface SessionSearchResult {
  sessionId: string;
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}

export interface SessionExchangeMutationResult {
  sessionId: string;
  userMessage?: StoredMessage;
  assistantMessages: StoredMessage[];
  deletedMessages: number;
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
  context?: {
    estimatedTokens: number;
    contextWindowTokens: number;
    usageFraction: number;
    percent: number;
    overThreshold: boolean;
    estimated: true;
    sampledMessages: number;
    totalMessages: number;
    truncated: boolean;
    provider: string;
    model: string;
  };
  lastPreview?: string;
}

export interface SessionUsageOptions {
  provider?: string;
  model?: string;
  sampleLimit?: number;
  threshold?: number;
}
