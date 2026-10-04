/** Browser-safe presentation contracts. Electron and runtime lifecycles stay out. */
export type UiRunState =
  | "running"
  | "waiting"
  | "attention"
  | "complete"
  | "stopped"
  | "error"
  | "offline";

export interface UiTarget {
  botId: string;
  sessionId: string;
  projectId?: string;
}

export interface UiBot {
  id: string;
  name: string;
  avatar?: string;
  isDefault: boolean;
  state: UiRunState | "ready";
}

export interface UiConversation extends UiTarget {
  title: string;
  state: UiRunState | "ready";
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
  sourceBotId: string;
  runId?: string;
}

export interface UiSnapshot {
  version: 1;
  revision: number;
  sequence: number;
  bots: UiBot[];
  conversations: UiConversation[];
  selected?: UiTarget;
}

export type UiHostCommand =
  | { type: "conversation.select"; target: UiTarget }
  | { type: "conversation.create"; botId: string }
  | { type: "transcript.read"; target: UiTarget }
  | {
      type: "chat.send";
      target: UiTarget;
      submissionId: string;
      message: string;
      attachmentIds?: string[];
    }
  | { type: "run.stop"; target: UiTarget; runId: string }
  | { type: "attachments.pick"; target: UiTarget }
  | {
      type: "surface.open";
      target: UiTarget;
      surface: "details" | "library" | "computer";
    }
  | { type: "draft.update"; target: UiTarget; text: string };

export type UiHostEvent =
  | { type: "snapshot"; sequence: number; snapshot: UiSnapshot }
  | {
      type: "message.delta";
      sequence: number;
      target: UiTarget;
      runId: string;
      messageId: string;
      text: string;
    }
  | {
      type: "run.state";
      sequence: number;
      target: UiTarget;
      runId: string;
      state: UiRunState;
    }
  | {
      type: "approval.requested";
      sequence: number;
      target: UiTarget;
      runId: string;
      approvalId: string;
      summary: string;
    };

export interface UiHostResult {
  requestId: string;
  accepted: boolean;
  runId?: string;
  target?: UiTarget;
  messages?: UiMessage[];
  attachments?: Array<{ id: string; name: string }>;
  error?: string;
}

/** Implementations authorize every read/action; a renderer is never authoritative. */
export interface UiHostV1 {
  readonly version: 1;
  getSnapshot(): Promise<UiSnapshot>;
  subscribe(listener: (event: UiHostEvent) => void, after?: number): () => void;
  dispatch(command: UiHostCommand): Promise<UiHostResult>;
}
