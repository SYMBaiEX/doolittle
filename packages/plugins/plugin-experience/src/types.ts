export type MemoryTarget = "memory" | "user";

export interface MemorySummary {
  target: MemoryTarget;
  entries: number;
  characters: number;
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

export interface SessionSearchResult {
  sessionId: string;
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}

export interface SessionServiceLike {
  usage(sessionId: string): SessionUsageSummary;
  latest(limit?: number): SessionSearchResult[];
}

export interface MemoryServiceLike {
  read(target?: MemoryTarget): string;
  summary(target?: MemoryTarget): MemorySummary;
}
