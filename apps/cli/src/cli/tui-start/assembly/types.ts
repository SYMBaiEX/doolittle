import type { AppLogger } from "@doolittle/agent/logging/logger";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import type { TuiThemeProfile } from "@doolittle/agent/runtime/theme-catalog";
import type blessed from "blessed";
import type { CliExecutionResult, CliState } from "../../execution/index";
import type { TuiLifecycleState } from "../../tui-lifecycle/types";
import type { TuiOverlayState } from "../../tui-overlays/index";
import type { TuiStateStore } from "../../tui-state";
import type { TuiWidgetSet } from "../../tui-widget-factory/index";
import type { TuiStartAssemblyHintOptions } from "../assembly-state";

export interface TuiStartAssemblyOptions {
  context: AppContext;
  state: CliState;
  logger: AppLogger;
  screen: blessed.Widgets.Screen;
  output: NodeJS.WriteStream;
  crashLogPath: string;
  transcriptExportPath: string;
  widgets: TuiWidgetSet;
  focusables: blessed.Widgets.BlessedElement[];
  tuiState: TuiStateStore;
  lifecycleState: TuiLifecycleState;
  queueState: import("../../tui-command-queue").TuiCommandQueueState;
  overlayState: TuiOverlayState;
  getActiveTheme: () => TuiThemeProfile;
  setActiveTheme: (theme: TuiThemeProfile) => void;
  isConversationalInput: (text: string) => boolean;
  truncate: (text: string, maxLength: number) => string;
  canCopyToClipboard: boolean;
}

export interface TuiStartAssemblyResult {
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
  refreshPanels: () => Promise<void>;
  scheduleRefreshPanels: (delayMs?: number) => void;
  updateFooterHint: (options?: TuiStartAssemblyHintOptions) => void;
  syncLayout: () => void;
  renderCurrentControlDeck: () => Promise<void>;
  renderTransportPanel: () => Promise<string>;
  renderExecutionPanel: () => Promise<string>;
  applyTheme: () => void;
  activatePrimaryInput: () => void;
  logFatal: (label: string, error: unknown) => void;
  dispose: () => void;
}
