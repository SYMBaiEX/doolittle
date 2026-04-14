import type blessed from "blessed";
import type { CliExecutionResult, CliState } from "@/cli/execution";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import type { TuiThemeProfile } from "@/runtime/theme-catalog";
import type { TuiOverlayState } from "../../tui-overlays";
import type { TuiStateStore } from "../../tui-state";
import type { InteractiveTextEntry } from "../../tui-text-entry";
import type { TuiWidgetSet } from "../../tui-widget-factory";
import type {
  TuiStartAssemblyHintOptions,
  TuiStartAssemblyState,
} from "../assembly-state";

export interface TuiStartSetupOptions {
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
  overlayState: TuiOverlayState;
  getActiveTheme: () => TuiThemeProfile;
  setActiveTheme: (theme: TuiThemeProfile) => void;
  isConversationalInput: (text: string) => boolean;
  truncate: (text: string, maxLength: number) => string;
  canCopyToClipboard: boolean;
}

export interface TuiStartSetupResult {
  assemblyState: TuiStartAssemblyState;
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
  clearLiveResponse: () => void;
  exportTranscript: () => void;
  getLiveResponse: () => ResponseTranscriptEntry | undefined;
  pushLiveToolEvent: (detail: string) => void;
  refreshLiveResponse: () => void;
  resetResponses: () => void;
  setLiveResponse: (
    label: string,
    body: string,
    options?: {
      kind?: ResponseTranscriptEntry["kind"];
      pending?: boolean;
    },
  ) => void;
  flushDeferredForeignActivity: () => void;
  scheduleDeferredForeignRefresh: (delayMs?: number) => void;
  routeForeignActivity: (
    source: "stdout" | "stderr" | "console",
    text: string,
  ) => void;
  renderCurrentControlDeck: () => Promise<void>;
  renderTransportPanel: () => Promise<string>;
  renderExecutionPanel: () => Promise<string>;
  renderFooterContent: () => string;
  setFooterHint: (hint: string, options?: { render?: boolean }) => void;
  refreshPanels: () => Promise<void>;
  scheduleRefreshPanels: (delayMs?: number) => void;
  updateFooterHint: (options?: TuiStartAssemblyHintOptions) => void;
  syncLayout: () => void;
  applyTheme: () => void;
  syncThemeFromSettings: () => Promise<void>;
  logFatal: (label: string, error: unknown) => void;
  activatePrimaryInput: () => void;
  activateTextEntry: (entry: InteractiveTextEntry) => void;
  deactivateTextEntry: (entry: InteractiveTextEntry) => void;
  focusProcessingSurface: () => void;
  hasLiveTextEntryCompletion: (entry: InteractiveTextEntry) => boolean;
  noteTextEntryActivity: () => void;
  textEntryFocused: () => boolean;
  renderAssistSuggestions: (value: string) => void;
  startBusySpinner: () => void;
  stopBusySpinner: () => void;
  dispose: () => void;
  overlays: ReturnType<typeof import("../../tui-overlays").installTuiOverlays>;
}
