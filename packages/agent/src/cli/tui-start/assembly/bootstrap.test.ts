import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { TuiStartSetupResult } from "../setup";

const setupCalls: Array<unknown[]> = [];
const foreignOutputCalls: Array<unknown[]> = [];
const inputLifecycleCalls: Array<unknown[]> = [];

const setupResult = {
  assemblyState: {
    refreshPanels: async () => {},
    scheduleRefreshPanels: () => {},
    updateFooterHint: () => {},
    queueCommand: () => {},
    setRefreshPanels: () => {},
    setScheduleRefreshPanels: () => {},
    setUpdateFooterHint: () => {},
    setQueueCommand: () => {},
  },
  appendActivity: () => {},
  pushNotice: () => {},
  pushResponseEntry: () => {},
  clearLiveResponse: () => {},
  exportTranscript: () => {},
  getLiveResponse: () => undefined,
  pushLiveToolEvent: () => {},
  refreshLiveResponse: () => {},
  resetResponses: () => {},
  setLiveResponse: () => {},
  flushDeferredForeignActivity: () => {},
  scheduleDeferredForeignRefresh: () => {},
  routeForeignActivity: () => {},
  renderCurrentControlDeck: async () => {},
  renderTransportPanel: async () => "transport",
  renderExecutionPanel: async () => "execution",
  renderFooterContent: () => "",
  setFooterHint: () => {},
  refreshPanels: async () => {},
  scheduleRefreshPanels: () => {},
  updateFooterHint: () => {},
  syncLayout: () => {},
  applyTheme: () => {},
  syncThemeFromSettings: async () => {},
  logFatal: () => {},
  activatePrimaryInput: () => {},
  activateTextEntry: () => {},
  deactivateTextEntry: () => {},
  focusProcessingSurface: () => {},
  hasLiveTextEntryCompletion: () => false,
  noteTextEntryActivity: () => {},
  textEntryFocused: () => false,
  renderAssistSuggestions: () => {},
  startBusySpinner: () => {},
  stopBusySpinner: () => {},
  dispose: () => {},
  overlays: {
    openPalette: () => {},
    openComposer: () => {},
    closePalette: () => {},
    closeComposer: () => {},
  },
} satisfies TuiStartSetupResult;

const lifecycle = {
  resetInputAfterQueue: () => {},
  restoreInputAfterRun: async () => {},
  handleEmptyQueueSubmit: () => {},
};

function installBootstrapMocks() {
  mock.module("../setup", () => ({
    createTuiStartSetup: (...args: unknown[]) => {
      setupCalls.push(args);
      return setupResult;
    },
  }));

  mock.module("../../tui-foreign-output", () => ({
    installTuiForeignOutput: (...args: unknown[]) => {
      foreignOutputCalls.push(args);
      return () => {
        foreignOutputCalls.push(["disposed"]);
      };
    },
  }));

  mock.module("../../tui-input-lifecycle", () => ({
    installTuiInputLifecycle: (...args: unknown[]) => {
      inputLifecycleCalls.push(args);
      return lifecycle;
    },
  }));
}

async function loadBootstrapTuiStartRuntime() {
  return import(`./bootstrap?bootstrap-test=${Date.now()}-${Math.random()}`);
}

const logger = {
  child: () => logger,
  captureError: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  event: () => {},
  measure: async () => undefined,
  flush: async () => undefined,
  bind: () => logger,
} as never;

const tuiState = { paletteOpen: false, composerOpen: false } as never;

const widgets = {
  inputBox: {} as never,
} as never;

describe("bootstrapTuiStartRuntime", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
    setupCalls.length = 0;
    foreignOutputCalls.length = 0;
    inputLifecycleCalls.length = 0;
    installBootstrapMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("assembles setup and lifecycle hooks", async () => {
    const { bootstrapTuiStartRuntime } = await loadBootstrapTuiStartRuntime();
    const result = bootstrapTuiStartRuntime({
      context: {} as never,
      state: {} as never,
      logger,
      screen: { render: () => {} } as never,
      output: { write: () => {} } as never,
      crashLogPath: "/tmp/crash.log",
      transcriptExportPath: "/tmp/transcript.txt",
      widgets,
      focusables: [],
      tuiState,
      overlayState: {} as never,
      getActiveTheme: () => ({}) as never,
      setActiveTheme: () => {},
      isConversationalInput: () => false,
      truncate: (text: string) => text,
      canCopyToClipboard: false,
      isScreenDestroyed: () => false,
      isShuttingDown: () => false,
      scheduleRefreshPanels: () => {},
      updateFooterHint: () => {},
    });

    expect(setupCalls).toHaveLength(1);
    expect(foreignOutputCalls).toHaveLength(1);
    expect(inputLifecycleCalls).toHaveLength(1);
    expect(result.surfaces).toBe(setupResult);
    expect(result.unsubscribers).toHaveLength(1);
    expect(result.tuiInputLifecycle).toBe(lifecycle);
    expect(typeof result.unsubscribers[0]).toBe("function");
  });
});
