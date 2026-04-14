import type { ExecutionBackendName } from "@/types/execution";
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

export interface TerminalServiceCommandOrchestratorOptions {
  workspaceDir: string;
  getSettings: () => RuntimeSettings;
  backends: Map<ExecutionBackendName, ExecutionBackend>;
  historyStore: TerminalCommandHistoryStore;
  cloudState?: CloudStateAccessor;
  onMutation?: () => void;
  onCommand?: (event: TerminalCommandUpdateEvent) => void;
}
