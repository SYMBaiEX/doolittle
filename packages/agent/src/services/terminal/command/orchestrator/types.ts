import type { ShellSandboxBackend } from "@elizaos/agent/services/shell-execution-router";
import type {
  ExecutionBackendName,
  TerminalCommandRecord,
} from "@/types/execution";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import type { CloudStateAccessor } from "../../cloud/store";
import type { ExecutionBackend } from "../../contracts/backend";
import type { TerminalCommandHistoryStore } from "../../records/history";

export interface TerminalCommandUpdateEvent {
  kind: "command";
  commandId: string;
  backend: ExecutionBackendName;
  exitCode: number;
  detail: string;
}

/** Narrow, invocation-local terminal evidence. Never written to feed/history. */
export interface TerminalExecutionObservation {
  record: Pick<
    TerminalCommandRecord,
    | "id"
    | "command"
    | "backend"
    | "backendMode"
    | "cwd"
    | "exitCode"
    | "stdout"
    | "stderr"
    | "timedOut"
    | "startedAt"
    | "completedAt"
  >;
  sandbox?: ShellSandboxBackend;
}

export interface TerminalServiceCommandOrchestratorOptions {
  workspaceDir?: string;
  getWorkspaceDir?: () => string;
  getSettings: () => RuntimeSettings;
  backends: Map<ExecutionBackendName, ExecutionBackend>;
  historyStore: TerminalCommandHistoryStore;
  cloudState?: CloudStateAccessor;
  onMutation?: () => void;
  onCommand?: (event: TerminalCommandUpdateEvent) => void;
  onExecutionResult?: (event: TerminalExecutionObservation) => void;
}
