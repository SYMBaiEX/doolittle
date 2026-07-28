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
  originMessageId?: string;
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
  projectId?: string;
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

export interface SessionLineage {
  parentSessionId?: string;
  forkedFromMessageId?: string;
  rootSessionId: string;
}

export interface SessionForkInput {
  sourceSessionId: string;
  throughMessageId?: string;
  beforeMessageId?: string;
}

export interface SessionForkResult extends SessionLineage {
  sessionId: string;
  sourceSessionId: string;
  boundaryMode: "before" | "full" | "through";
  copiedThroughMessageId?: string;
  continuityKey: string;
  copiedMessageCount: number;
  projectId?: string;
  summary: SessionSummary;
}

export interface SessionSummary extends Partial<SessionLineage> {
  sessionId: string;
  projectId?: string;
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
  projectId?: string;
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

export interface Project {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  icon?: string;
  pinned: boolean;
  primaryPath?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectResource {
  id: string;
  projectId: string;
  kind: "file" | "folder" | "source" | "note" | "link";
  label: string;
  value: string;
  createdAt: string;
}

export interface SessionUsageOptions {
  provider?: string;
  model?: string;
  sampleLimit?: number;
  threshold?: number;
}
