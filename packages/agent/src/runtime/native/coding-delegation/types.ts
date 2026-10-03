import type { RunControllerService } from "@/services/run-controller-service";

export interface DelegatedToolObservation {
  id: string;
  title: string;
  kind: string;
  status: string;
}

export interface DelegatedFileChange {
  path: string;
  beforeSha256: string | null;
  afterSha256: string | null;
  bytes: number;
}

/** SDK-reported worker events only, not billable or whole-workflow usage. */
export interface DelegatedUsageEvidence {
  source: "eliza-sdk-session-usage-update";
  coverage: "reported-sdk-events-only";
  state: "measured" | "unavailable";
  acceptedEvents: number;
  duplicateEvents: number;
  conflictingEvents: number;
  rejectedEvents: number;
  truncatedEvents: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheTokens: number | null;
  costCoverageEvents: number;
  costUsd: number | null;
}

export interface DelegatedExecutionReceipt {
  sessionId: string;
  agentType: string;
  workdir: string;
  status: "completed" | "failed" | "cancelled";
  stopReason: string;
  exitCode: number | null;
  summary: string;
  failureMessage?: string;
  observedTools: DelegatedToolObservation[];
  changedFiles: DelegatedFileChange[];
  verifiedLocalMutation: boolean;
  usage?: DelegatedUsageEvidence;
  initialSelection?: DelegatedInitialSelectionEvidence;
}

/** Adapter initial state only; not server-effective or per-prompt execution. */
export interface DelegatedInitialSelectionEvidence {
  readonly schemaVersion: 1;
  readonly source:
    | "acp-session-new-config-options"
    | "acp-session-new-legacy-model-state"
    | "unavailable";
  readonly subject: "delegated-worker";
  readonly coverage: "initial-selection-only";
  readonly state: "reported" | "unavailable" | "rejected" | "conflicting";
  readonly commandProvenance: "configured-command-1.13.1" | "unverified";
  readonly rejection: "malformed" | "truncated" | null;
  readonly modelSha256: string | null;
  readonly selectionSha256: string | null;
  readonly reasoningEffort:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | null;
  readonly effectiveExecution: "unavailable";
}

export interface AcpSpawnOptions {
  agentType?: string;
  workdir?: string;
  initialTask?: string;
  model?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  approvalPreset?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AcpSession {
  sessionId: string;
  agentType: string;
  workdir: string;
  status: string;
  [key: string]: unknown;
}

export interface AcpPromptResult {
  stopReason?: string;
  exitCode?: number | null;
  error?: string;
}

/** Public beta.7 ACP service methods; keep package internals out of app imports. */
export interface ManagedAcpService {
  defaultApprovalPreset?: string;
  spawnSession(options: AcpSpawnOptions): Promise<AcpSession>;
  sendPrompt(
    sessionId: string,
    task: string,
    options: { model?: string; timeoutMs: number },
  ): Promise<AcpPromptResult>;
  cancelSession(sessionId: string): Promise<void>;
  stopSession(sessionId: string): Promise<void>;
  getSession?(
    sessionId: string,
  ):
    | Promise<{ lastError?: string } | undefined>
    | { lastError?: string }
    | undefined;
  onSessionEvent(
    listener: (sessionId: string, event: string, data: unknown) => void,
  ): () => void;
}

export interface CodingDelegationServices {
  workspace: { root(): string };
  runController: RunControllerService;
  terminal?: {
    appServers?: {
      listOwnedSessions(owner: string): Array<{
        id: string;
        cwd?: string;
        command?: string;
        processId?: number;
      }>;
    };
  };
}
