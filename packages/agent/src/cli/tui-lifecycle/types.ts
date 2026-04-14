import type { CliExecutionResult, CliState } from "@/cli/execution";
import type { AppContext } from "@/runtime/bootstrap";

export interface TuiLifecycleState {
  screenDestroyed: boolean;
  shuttingDown: boolean;
  requestedExitCode: number;
  exitAfterTurnCancellation: boolean;
  forceExitTimer: ReturnType<typeof setTimeout> | null;
  lastInterruptAt: number;
  activeTurnAbortController: AbortController | null;
  busy: boolean;
}

export interface TuiLifecycleScreen {
  destroy(): void;
}

export interface TuiLifecycleOptions {
  context: AppContext;
  state: CliState;
  screen: TuiLifecycleScreen;
  output: NodeJS.WriteStream;
  crashLogPath: string;
  lifecycleState: TuiLifecycleState;
  logFatal: (label: string, error: unknown) => void;
  stopBusySpinner: () => void;
  appendActivity: (
    kind: string,
    message: string,
    tone: CliExecutionResult["tone"],
  ) => void;
  pushNotice: (kind: "context" | "skills" | "status", message: string) => void;
  pushResponseEntry: (
    label: string,
    body: string,
    options?: { elapsed?: string },
  ) => void;
  scheduleRefreshPanels: (delayMs?: number) => void;
  clearLiveResponse: () => void;
}

export interface TuiLifecycleController {
  exitCli(exitCode?: number): void;
  handleSigint(): void;
  dispose(): void;
}
