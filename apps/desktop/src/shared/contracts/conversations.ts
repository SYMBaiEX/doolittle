import type { ManagedAttachmentDescriptor } from "./desktop";

export interface SessionSummary {
  sessionId: string;
  projectId?: string;
  title?: string;
  continuityKey?: string;
  parentSessionId?: string;
  forkedFromMessageId?: string;
  rootSessionId?: string;
  messageCount: number;
  startedAt?: string;
  endedAt?: string;
  participants: Array<"user" | "assistant" | "system">;
  preview: string[];
}

export interface SessionsResponse {
  sessions: SessionSummary[];
}

export interface StoredMessage {
  id: string;
  originMessageId?: string;
  sessionId: string;
  roomId: string;
  entityId: string;
  role: "user" | "assistant" | "system";
  text: string;
  attachments?: ManagedAttachmentDescriptor[];
  createdAt: string;
}

export interface SessionMessagesResponse {
  messages: StoredMessage[];
}

export interface SessionForkRequest {
  sourceSessionId: string;
  throughMessageId?: string;
  beforeMessageId?: string;
}

export interface SessionForkResult {
  sessionId: string;
  sourceSessionId: string;
  parentSessionId: string;
  forkedFromMessageId: string;
  rootSessionId: string;
  boundaryMode: "before" | "full" | "through";
  copiedThroughMessageId?: string;
  continuityKey: string;
  copiedMessageCount: number;
  projectId?: string;
  summary: SessionSummary;
}

export interface SessionForkResponse {
  fork: SessionForkResult;
}

export type ActivityEventKind =
  | "chat-run"
  | "automation"
  | "delegation"
  | "approval"
  | "delivery";

export type ActivityEventStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped"
  | "approved"
  | "denied"
  | "expired"
  | "used"
  | "delivered";

export type ActivityEventTarget =
  | "chat"
  | "review"
  | "automations"
  | "orchestration";

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  sourceId: string;
  sessionId?: string;
  status: ActivityEventStatus;
  occurredAt: string;
  title: string;
  safeSummary: string;
  target: ActivityEventTarget;
}

export interface ActivityFeedResponse {
  events: ActivityEvent[];
  cursor: string | null;
  updatedAt: string | null;
}

export interface SessionSearchHit {
  sessionId: string;
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}

export interface SessionSearchResponse {
  hits: SessionSearchHit[];
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

export interface SessionTitleRequest {
  sessionId: string;
  title: string;
}
