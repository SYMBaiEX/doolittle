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

export interface UiRunReceipt {
  target: UiTarget;
  runId: string;
  state: UiRunState;
  /** Cursor in the host event stream; not a second execution identity. */
  sequence: number;
}

export type UiHostCommand =
  | { type: "conversation.select"; target: UiTarget }
  | { type: "conversation.create"; botId: string }
  | {
      type: "transcript.read";
      target: UiTarget;
      /** Canonical transcript as of this run, excluding subsequent turns. */
      throughRunId?: string;
    }
  | {
      type: "chat.send";
      target: UiTarget;
      submissionId: string;
      /** Optional protocol-native identity. The host rejects existing run collisions. */
      runId?: string;
      message: string;
      attachmentIds?: string[];
    }
  | { type: "run.stop"; target: UiTarget; runId: string }
  | { type: "run.read"; target: UiTarget; runId: string }
  | {
      type: "approval.present";
      target: UiTarget;
      runId: string;
      approvalId: string;
    }
  | { type: "attachments.pick"; target: UiTarget }
  | {
      type: "surface.open";
      target: UiTarget;
      surface: "details" | "library" | "computer";
    }
  | { type: "draft.update"; target: UiTarget; text: string }
  | { type: "draft.read"; target: UiTarget };

export type UiHostEvent =
  | { type: "snapshot"; sequence: number; snapshot: UiSnapshot }
  | {
      type: "draft.changed";
      sequence: number;
      target: UiTarget;
      revision: number;
    }
  | {
      type: "message.delta";
      sequence: number;
      target: UiTarget;
      runId: string;
      messageId: string;
      text: string;
      sourceBotId?: string;
    }
  | {
      type: "message.completed";
      sequence: number;
      target: UiTarget;
      runId: string;
      messageId: string;
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
    }
  | {
      type: "custom";
      sequence: number;
      target: UiTarget;
      runId: string;
      name: string;
      value: unknown;
    };

export interface UiHostResult {
  requestId: string;
  accepted: boolean;
  runId?: string;
  run?: UiRunReceipt;
  target?: UiTarget;
  messages?: UiMessage[];
  /** Required acknowledgement when an as-of transcript was requested. */
  transcriptThroughRunId?: string;
  attachments?: Array<{ id: string; name: string }>;
  draft?: {
    target: UiTarget;
    text: string;
    revision?: number;
    exists?: boolean;
  };
  error?: string;
}

/** Implementations authorize every read/action; a renderer is never authoritative. */
export type UiHostSubscription = (() => void) & {
  /** Async transports acknowledge installation before any submitted run. */
  readonly ready?: Promise<void>;
};

export interface UiHostV1 {
  readonly version: 1;
  getSnapshot(): Promise<UiSnapshot>;
  subscribe(
    listener: (event: UiHostEvent) => void,
    after?: number,
  ): UiHostSubscription;
  dispatch(command: UiHostCommand): Promise<UiHostResult>;
}
