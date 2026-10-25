import type { AppLogger } from "@doolittle/agent/logging/logger";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import type blessed from "blessed";
import type { CliState } from "../../../execution/index";
import type { TuiCommandQueueState } from "../../../tui-command-queue/index";
import type { TuiLifecycleState } from "../../../tui-lifecycle/types";
import type { TuiStateStore } from "../../../tui-state";
import type { TuiWidgetSet } from "../../../tui-widget-factory/index";
import type { TuiStartSetupResult } from "../../setup";

export interface TuiStartControllersOptions {
  context: AppContext;
  state: CliState;
  logger: AppLogger;
  screen: blessed.Widgets.Screen;
  output: NodeJS.WriteStream;
  crashLogPath: string;
  tuiState: TuiStateStore;
  lifecycleState: TuiLifecycleState;
  queueState: TuiCommandQueueState;
  widgets: TuiWidgetSet;
  focusables: blessed.Widgets.BlessedElement[];
  surfaces: TuiStartSetupResult;
  tuiInputLifecycle: {
    resetInputAfterQueue: () => void;
    restoreInputAfterRun: () => Promise<void>;
    handleEmptyQueueSubmit: () => void;
  };
  isConversationalInput: (text: string) => boolean;
}

export interface TuiStartControllersResult {
  dispose: () => void;
}

export interface TuiStartCommandQueueController {
  queueCommand: (line: string) => void;
  historyBack: () => string | undefined;
  historyForward: () => string | undefined;
  hasHistory: () => boolean;
}

export interface TuiStartLifecycleController {
  exitCli: (exitCode?: number) => void;
  handleSigint: () => void;
  dispose: () => void;
}
