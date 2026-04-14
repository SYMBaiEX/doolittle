import type { ask, askYesNo, chooseOne } from "../../core/prompt-ops";
import type { BrowserMode, ExecutionBackendName } from "../../types";

export interface ExecutionBodyTargetSelectionResult {
  sshHost: string;
  sshUser: string;
  sshPath: string;
  daytonaTarget: string;
  modalTarget: string;
}

export interface ExecutionBodySelectionResult
  extends ExecutionBodyTargetSelectionResult {
  backend: ExecutionBackendName;
  browser: BrowserMode;
}

export interface ExecutionBodyDefaults {
  backend: ExecutionBackendName;
  browser: BrowserMode;
}

export interface ExecutionBodyPromptDeps {
  chooseOne: typeof chooseOne;
  ask: typeof ask;
  askYesNo: typeof askYesNo;
}
