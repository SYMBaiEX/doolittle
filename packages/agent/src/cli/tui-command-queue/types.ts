import type {
  CliExecutionHooks,
  CliExecutionResult,
  CliState,
} from "@/cli/execution";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";

export interface TuiCommandQueueState {
  busy: boolean;
  queueDepth: number;
  activeTurnAbortController: AbortController | null;
  exitAfterTurnCancellation: boolean;
  requestedExitCode: number;
  screenDestroyed: boolean;
}

export interface TuiCommandQueueOptions {
  context: AppContext;
  state: CliState;
  logger: AppLogger;
  queueState: TuiCommandQueueState;
  executeInput: (
    line: string,
    context: AppContext,
    state: CliState,
    hooks?: CliExecutionHooks,
  ) => Promise<CliExecutionResult>;
  isConversationalInput: (text: string) => boolean;
  appendActivity: (
    kind: string,
    message: string,
    tone: CliExecutionResult["tone"],
  ) => void;
  getLiveResponse: () => ResponseTranscriptEntry | undefined;
  setLiveResponse: (
    label: string,
    body: string,
    options?: { kind?: ResponseTranscriptEntry["kind"]; pending?: boolean },
  ) => void;
  pushResponseEntry: (
    label: string,
    body: string,
    options?: { elapsed?: string },
  ) => void;
  pushNotice: (kind: "context" | "skills" | "status", message: string) => void;
  scheduleRefreshPanels: (delayMs?: number) => void;
  syncThemeFromSettings: () => Promise<void>;
  startBusySpinner: () => void;
  stopBusySpinner: () => void;
  focusProcessingSurface: () => void;
  refreshPanels: () => Promise<void>;
  flushDeferredForeignActivity: () => void;
  resetInputAfterQueue: () => void;
  restoreInputAfterRun: () => Promise<void>;
  handleEmptyQueueSubmit: () => void;
  onRecoveryFailure: (error: unknown) => void;
  destroyScreen: () => void;
  requestExit: (exitCode?: number) => void;
}

export interface TuiCommandQueueController {
  queueCommand(line: string): void;
  historyBack(): string | undefined;
  historyForward(): string | undefined;
  hasHistory(): boolean;
}
