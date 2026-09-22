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
}

export interface AcpSpawnOptions {
  agentType?: string;
  workdir?: string;
  initialTask?: string;
  model?: string;
  timeoutMs?: number;
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
  spawnSession(options: AcpSpawnOptions): Promise<AcpSession>;
  sendPrompt(
    sessionId: string,
    task: string,
    options: { model?: string; timeoutMs: number },
  ): Promise<AcpPromptResult>;
  cancelSession(sessionId: string): Promise<void>;
  stopSession(sessionId: string): Promise<void>;
  onSessionEvent(
    listener: (sessionId: string, event: string, data: unknown) => void,
  ): () => void;
}

export interface CodingDelegationServices {
  workspace: { root(): string };
  runController: RunControllerService;
}
