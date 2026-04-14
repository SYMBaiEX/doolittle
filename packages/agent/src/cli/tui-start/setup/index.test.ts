import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { TuiStartSetupResult } from "./types";

const assemblyState = {
  refreshPanels: async () => {},
  scheduleRefreshPanels: () => {},
  updateFooterHint: () => {},
  queueCommand: () => {},
  setRefreshPanels: () => {},
  setScheduleRefreshPanels: () => {},
  setUpdateFooterHint: () => {},
  setQueueCommand: () => {},
};

const inputSetup = {
  activateTextEntry: () => {},
  deactivateTextEntry: () => {},
  focusPrimaryInput: () => {},
  focusProcessingSurface: () => {},
  hasLiveTextEntryCompletion: () => false,
  noteTextEntryActivity: () => {},
  textEntryFocused: () => false,
  overlays: {
    openPalette: () => {},
    openComposer: () => {},
    closeComposer: () => {},
    closePalette: () => {},
  },
};

const runtimeSurfaces = {
  tuiActivityFeed: {
    dispose: () => {},
  },
  appendActivity: () => {},
  flushDeferredForeignActivity: () => {},
  pushNotice: () => {},
  routeForeignActivity: () => {},
  scheduleDeferredForeignRefresh: () => {},
  transcript: {
    pushResponseEntry: () => {},
    clearLiveResponse: () => {},
    exportTranscript: () => {},
    getLiveResponse: () => undefined,
    pushLiveToolEvent: () => {},
    refreshLiveResponse: () => {},
    resetResponses: () => {},
    setLiveResponse: () => {},
  },
  logFatal: () => {},
};

const presentation = {
  renderCurrentControlDeck: async () => {},
  renderTransportPanel: async () => "transport",
  renderExecutionPanel: async () => "execution",
  renderFooterContent: () => "",
  setFooterHint: () => {},
  refreshPanels: async () => {},
  scheduleRefreshPanels: () => {},
  syncLayout: () => {},
  applyTheme: () => {},
  syncThemeFromSettings: async () => {},
  renderAssistSuggestions: () => {},
  startBusySpinner: () => {},
  stopBusySpinner: () => {},
};

function installSetupMocks() {
  mock.module("../assembly-state", () => ({
    createTuiStartAssemblyState: () => assemblyState,
  }));

  mock.module("./input", () => ({
    createTuiStartInputSetup: () => inputSetup,
  }));

  mock.module("./runtime-surfaces", () => ({
    createTuiStartRuntimeSurfaces: () => runtimeSurfaces,
  }));

  mock.module("./presentation", () => ({
    createTuiStartPresentationSetup: () => presentation,
  }));
}

async function loadCreateTuiStartSetup() {
  const { createTuiStartSetup } = await import(
    `./index?setup-test=${Date.now()}-${Math.random()}`
  );
  return createTuiStartSetup;
}

describe("createTuiStartSetup", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
    installSetupMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("assembles input, runtime surfaces, and presentation into the public setup contract", async () => {
    const createTuiStartSetup = await loadCreateTuiStartSetup();
    const result = createTuiStartSetup({
      context: {
        config: {
          workspaceDir: "/workspace",
        },
      } as never,
      state: {} as never,
      logger: {} as never,
      screen: {} as never,
      output: {} as never,
      crashLogPath: "/tmp/crash.log",
      transcriptExportPath: "/tmp/transcript.txt",
      widgets: {
        inputBox: {},
      } as never,
      focusables: [],
      tuiState: {} as never,
      overlayState: {} as never,
      getActiveTheme: () => ({}) as never,
      setActiveTheme: () => {},
      isConversationalInput: () => false,
      truncate: (text: string) => text,
      canCopyToClipboard: false,
    });

    const typed = result satisfies TuiStartSetupResult;

    expect(typed.assemblyState).toBe(assemblyState);
    expect(typed.pushNotice).toBe(runtimeSurfaces.pushNotice);
    expect(typed.pushResponseEntry).toBe(
      runtimeSurfaces.transcript.pushResponseEntry,
    );
    expect(typed.renderExecutionPanel).toBe(presentation.renderExecutionPanel);
    expect(typed.overlays).toBe(inputSetup.overlays);
    expect(typeof typed.dispose).toBe("function");
  });
});
