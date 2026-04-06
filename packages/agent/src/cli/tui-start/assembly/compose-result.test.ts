import { describe, expect, it } from "bun:test";
import type { TuiStartSetupResult } from "../setup";
import { composeTuiStartAssemblyResult } from "./compose-result";

function createSurfaces(calls: {
  disposed: number;
  refreshPanels: number;
  scheduled: Array<number | undefined>;
  footerHints: Array<{ render?: boolean } | undefined>;
  logFatal: number;
}): TuiStartSetupResult {
  return {
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
    refreshPanels: async () => {
      calls.refreshPanels += 1;
    },
    scheduleRefreshPanels: (delayMs) => {
      calls.scheduled.push(delayMs);
    },
    updateFooterHint: (options) => {
      calls.footerHints.push(options);
    },
    syncLayout: () => {},
    applyTheme: () => {},
    syncThemeFromSettings: async () => {},
    logFatal: () => {
      calls.logFatal += 1;
    },
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
    dispose: () => {
      calls.disposed += 1;
    },
    overlays: {
      openPalette: () => {},
      openComposer: () => {},
      closePalette: () => {},
      closeComposer: () => {},
    },
  };
}

describe("composeTuiStartAssemblyResult", () => {
  it("delegates runtime actions to surface handlers", async () => {
    const calls = {
      disposed: 0,
      refreshPanels: 0,
      scheduled: [] as Array<number | undefined>,
      footerHints: [] as Array<Record<string, unknown> | undefined>,
      logFatal: 0,
    };
    let disposedControllers = 0;
    let unsubscribersCalled = 0;
    const bootstrapUnsubscribers = [
      () => {
        unsubscribersCalled += 1;
      },
      () => {
        unsubscribersCalled += 1;
      },
    ];

    const surfaces = createSurfaces(calls);
    const runtime = composeTuiStartAssemblyResult({
      surfaces,
      disposeControllers: () => {
        disposedControllers += 1;
      },
      bootstrapUnsubscribers,
    });

    await runtime.refreshPanels();
    runtime.scheduleRefreshPanels(42);
    runtime.updateFooterHint({ render: false });
    runtime.logFatal("renderFailure", new Error("oops"));

    expect(calls.refreshPanels).toBe(1);
    expect(calls.scheduled).toEqual([42]);
    expect(calls.footerHints).toEqual([{ render: false }]);
    expect(calls.logFatal).toBe(1);

    runtime.dispose();
    expect(calls.disposed).toBe(1);
    expect(disposedControllers).toBe(1);
    expect(unsubscribersCalled).toBe(2);
  });
});
