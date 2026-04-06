import { describe, expect, it } from "bun:test";
import type {
  CliExecutionHooks,
  CliExecutionResult,
  CliState,
} from "@/cli/execution";
import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import {
  installTuiCommandQueue,
  type TuiCommandQueueState,
} from "@/cli/tui-command-queue";
import { createNoopLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";

function createContext(agentName = "Doolittle"): AppContext {
  return {
    config: {
      agentName,
      workspaceDir: "/tmp",
    },
    services: {
      runController: {
        getActive: () => null,
      },
    },
  } as unknown as AppContext;
}

async function flushQueue(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("installTuiCommandQueue", () => {
  it("processes conversational input and restores the UI after completion", async () => {
    const state: CliState = {
      activeSessionId: "cli:test",
      notices: [],
    };
    const queueState: TuiCommandQueueState = {
      busy: false,
      queueDepth: 0,
      activeTurnAbortController: null,
      exitAfterTurnCancellation: false,
      requestedExitCode: 0,
      screenDestroyed: false,
    };
    const responses: Array<{
      label: string;
      body: string;
      elapsed?: string;
    }> = [];
    const activities: string[] = [];
    let liveResponse: ResponseTranscriptEntry | undefined;
    let restoreCount = 0;
    let startBusyCount = 0;
    let stopBusyCount = 0;

    const controller = installTuiCommandQueue({
      context: createContext(),
      state,
      logger: createNoopLogger(),
      queueState,
      executeInput: async () => ({
        text: "hi",
        tone: "agent",
      }),
      isConversationalInput: (text) =>
        !!text.trim() && !text.startsWith("/") && !text.startsWith("!"),
      appendActivity: (_kind, message) => {
        activities.push(message);
      },
      getLiveResponse: () => liveResponse,
      setLiveResponse: (label, body, options) => {
        liveResponse = {
          label,
          body,
          at: "10:00:00",
          kind: options?.kind,
          pending: options?.pending,
        };
      },
      pushResponseEntry: (label, body, options) => {
        responses.push({ label, body, elapsed: options?.elapsed });
      },
      pushNotice: () => {},
      scheduleRefreshPanels: () => {},
      syncThemeFromSettings: async () => {},
      startBusySpinner: () => {
        startBusyCount += 1;
      },
      stopBusySpinner: () => {
        stopBusyCount += 1;
      },
      focusProcessingSurface: () => {},
      refreshPanels: async () => {},
      flushDeferredForeignActivity: () => {},
      resetInputAfterQueue: () => {},
      restoreInputAfterRun: async () => {
        restoreCount += 1;
      },
      handleEmptyQueueSubmit: () => {},
      onRecoveryFailure: () => {
        throw new Error("unexpected recovery failure");
      },
      destroyScreen: () => {},
      requestExit: () => {},
    });

    controller.queueCommand("hello there");
    await flushQueue();

    expect(responses).toEqual([
      { label: "You", body: "hello there", elapsed: undefined },
      { label: "Doolittle", body: "hi", elapsed: undefined },
    ]);
    expect(activities).toContain("hello there");
    expect(queueState.busy).toBe(false);
    expect(queueState.queueDepth).toBe(0);
    expect(queueState.activeTurnAbortController).toBeNull();
    expect(startBusyCount).toBe(1);
    expect(stopBusyCount).toBe(1);
    expect(restoreCount).toBe(1);
  });

  it("tracks command history through the extracted controller", async () => {
    const queueState: TuiCommandQueueState = {
      busy: false,
      queueDepth: 0,
      activeTurnAbortController: null,
      exitAfterTurnCancellation: false,
      requestedExitCode: 0,
      screenDestroyed: false,
    };
    const controller = installTuiCommandQueue({
      context: createContext(),
      state: {
        activeSessionId: "cli:test",
        notices: [],
      },
      logger: createNoopLogger(),
      queueState,
      executeInput: async () => ({ text: "", tone: "info" }),
      isConversationalInput: (text) =>
        !!text.trim() && !text.startsWith("/") && !text.startsWith("!"),
      appendActivity: () => {},
      getLiveResponse: () => undefined,
      setLiveResponse: () => {},
      pushResponseEntry: () => {},
      pushNotice: () => {},
      scheduleRefreshPanels: () => {},
      syncThemeFromSettings: async () => {},
      startBusySpinner: () => {},
      stopBusySpinner: () => {},
      focusProcessingSurface: () => {},
      refreshPanels: async () => {},
      flushDeferredForeignActivity: () => {},
      resetInputAfterQueue: () => {},
      restoreInputAfterRun: async () => {},
      handleEmptyQueueSubmit: () => {},
      onRecoveryFailure: () => {
        throw new Error("unexpected recovery failure");
      },
      destroyScreen: () => {},
      requestExit: () => {},
    });

    controller.queueCommand("/help");
    controller.queueCommand("hello");
    await flushQueue();

    expect(controller.hasHistory()).toBe(true);
    expect(controller.historyBack()).toBe("hello");
    expect(controller.historyBack()).toBe("/help");
    expect(controller.historyForward()).toBe("hello");
    expect(controller.historyForward()).toBe("");
  });

  it("requests exit instead of restoring the input when cancellation is pending", async () => {
    const queueState: TuiCommandQueueState = {
      busy: false,
      queueDepth: 0,
      activeTurnAbortController: null,
      exitAfterTurnCancellation: true,
      requestedExitCode: 130,
      screenDestroyed: false,
    };
    let requestedExit: number | undefined;
    let restoreCount = 0;

    const controller = installTuiCommandQueue({
      context: createContext(),
      state: {
        activeSessionId: "cli:test",
        notices: [],
      },
      logger: createNoopLogger(),
      queueState,
      executeInput: async (
        _line,
        _context,
        _state,
        _hooks?: CliExecutionHooks,
      ): Promise<CliExecutionResult> => ({
        text: "done",
        tone: "success",
      }),
      isConversationalInput: () => false,
      appendActivity: () => {},
      getLiveResponse: () => undefined,
      setLiveResponse: () => {},
      pushResponseEntry: () => {},
      pushNotice: () => {},
      scheduleRefreshPanels: () => {},
      syncThemeFromSettings: async () => {},
      startBusySpinner: () => {},
      stopBusySpinner: () => {},
      focusProcessingSurface: () => {},
      refreshPanels: async () => {},
      flushDeferredForeignActivity: () => {},
      resetInputAfterQueue: () => {},
      restoreInputAfterRun: async () => {
        restoreCount += 1;
      },
      handleEmptyQueueSubmit: () => {},
      onRecoveryFailure: () => {
        throw new Error("unexpected recovery failure");
      },
      destroyScreen: () => {},
      requestExit: (exitCode) => {
        requestedExit = exitCode;
      },
    });

    controller.queueCommand("/jobs");
    await flushQueue();

    expect(requestedExit).toBe(130);
    expect(restoreCount).toBe(0);
    expect(queueState.exitAfterTurnCancellation).toBe(false);
  });
});
