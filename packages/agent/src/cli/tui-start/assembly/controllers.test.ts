import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { TuiStartSetupResult } from "../setup";

const commandQueueCalls: Array<unknown[]> = [];
const inputBindingsCalls: Array<unknown[]> = [];
const lifecycleCalls: Array<unknown[]> = [];
const screenBindingsCalls: Array<unknown[]> = [];
const screenEventsCalls: Array<unknown[]> = [];
const runtimeObserversCalls: Array<unknown[]> = [];
let runtimeObserversDisposed = 0;

const queueController = {
  queueCommand: () => {},
  historyBack: () => "/history-back",
  historyForward: () => "/history-forward",
  hasHistory: () => true,
};
const lifecycleController = {
  exitCli: () => {
    lifecycleCalls[0].push("exitCli");
  },
  handleSigint: () => {
    lifecycleCalls[0].push("sigint");
  },
  dispose: () => {
    lifecycleControllerDisposer += 1;
  },
};
let lifecycleControllerDisposer = 0;

function installControllerMocks() {
  mock.module("@/cli/tui-command-queue", () => ({
    installTuiCommandQueue: (...args: unknown[]) => {
      commandQueueCalls.push(args);
      return queueController;
    },
  }));

  mock.module("@/cli/tui-input-bindings", () => ({
    installTuiInputBindings: (...args: unknown[]) => {
      inputBindingsCalls.push(args);
    },
  }));

  mock.module("@/cli/tui-lifecycle/controller", () => ({
    createTuiLifecycleController: () => {
      lifecycleCalls.push([]);
      return lifecycleController;
    },
  }));

  mock.module("@/cli/tui-screen-bindings", () => ({
    installTuiScreenBindings: (...args: unknown[]) => {
      screenBindingsCalls.push(args);
    },
  }));

  mock.module("@/cli/tui-screen-events", () => ({
    installTuiScreenEvents: (...args: unknown[]) => {
      screenEventsCalls.push(args);
    },
  }));

  mock.module("@/cli/tui-runtime-observers", () => ({
    installTuiRuntimeObservers: (...args: unknown[]) => {
      runtimeObserversCalls.push(args);
      return () => {
        runtimeObserversDisposed += 1;
      };
    },
  }));
}

async function loadInstallTuiStartControllers() {
  return import(
    `./controllers?controllers-test=${Date.now()}-${Math.random()}`
  );
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

const tuiInputLifecycle = {
  resetInputAfterQueue: () => {},
  restoreInputAfterRun: async () => {},
  handleEmptyQueueSubmit: () => {},
};

const tuiState = {
  controlDeckMode: "assistant",
  focusIndex: 0,
  paletteOpen: false,
  composerOpen: false,
  busy: false,
  opsCollapsed: false,
} as never;

const widgets = {
  inputBox: {
    focus: () => {},
    on: () => {},
    key: () => {},
  } as never,
  response: { focus: () => {}, scroll: () => {} } as never,
  activity: { scroll: () => {} } as never,
  sidebar: { scroll: () => {} } as never,
  assistBox: { scroll: () => {} } as never,
  paletteInput: {} as never,
  paletteList: {} as never,
  composer: {} as never,
} as never;

const surfaces = {
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

describe("installTuiStartControllers", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
    commandQueueCalls.length = 0;
    inputBindingsCalls.length = 0;
    lifecycleCalls.length = 0;
    screenBindingsCalls.length = 0;
    screenEventsCalls.length = 0;
    runtimeObserversCalls.length = 0;
    runtimeObserversDisposed = 0;
    lifecycleControllerDisposer = 0;
    installControllerMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("wires command queue, input, lifecycle, and observer controllers", async () => {
    const { installTuiStartControllers } =
      await loadInstallTuiStartControllers();
    const result = installTuiStartControllers({
      context: {
        config: { workspaceDir: "/tmp" },
        gateway: { onUpdate: () => {} },
      } as never,
      state: { notices: [] } as never,
      logger,
      screen: {
        key: () => {},
        render: () => {},
      } as never,
      output: { write: () => {} } as never,
      crashLogPath: "/tmp/crash.log",
      tuiState,
      lifecycleState: {
        forceExitTimer: null,
        lastInterruptAt: 0,
      } as never,
      queueState: {} as never,
      widgets,
      focusables: [],
      surfaces,
      tuiInputLifecycle,
      isConversationalInput: () => false,
    });

    expect(commandQueueCalls).toHaveLength(1);
    expect(inputBindingsCalls).toHaveLength(1);
    expect(lifecycleCalls).toHaveLength(1);
    expect(screenBindingsCalls).toHaveLength(1);
    expect(screenEventsCalls).toHaveLength(1);
    expect(runtimeObserversCalls).toHaveLength(1);
    expect(typeof result.dispose).toBe("function");

    result.dispose();
    expect(lifecycleControllerDisposer).toBe(1);
    expect(runtimeObserversDisposed).toBe(1);
  });
});
