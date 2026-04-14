import { describe, expect, it } from "bun:test";
import {
  runTuiBootSequence,
  scheduleTuiDeferredHydration,
  waitForTuiDestroy,
} from "@/cli/tui-runtime-shell";
import type { AppContext } from "@/runtime/bootstrap";

describe("tui runtime shell helpers", () => {
  it("runs the initial boot sequence and primes panels before onReady", async () => {
    const activities: string[] = [];
    const responses: Array<{ label: string; body: string }> = [];
    const traces: string[] = [];
    const transportBox = {
      hidden: false,
      content: "",
      setContent(content: string) {
        this.content = content;
      },
    };
    const executionBox = {
      hidden: false,
      content: "",
      setContent(content: string) {
        this.content = content;
      },
    };
    const bootOrder: string[] = [];

    await runTuiBootSequence({
      bootMessage: "Booted",
      tipMessage: "Tip",
      welcomeBody: "Welcome",
      bootLogs: [{ source: "stdout", text: "boot log" }],
      appendActivity: (_kind, message) => {
        activities.push(message);
      },
      pushResponseEntry: (label, body) => {
        responses.push({ label, body });
      },
      transportBox,
      executionBox,
      renderTransportPanel: async () => "transport",
      renderExecutionPanel: async () => "execution",
      renderCurrentControlDeck: async () => {
        bootOrder.push("deck");
      },
      applyTheme: () => {
        bootOrder.push("theme");
      },
      appendTrace: (label) => {
        traces.push(label);
      },
      refreshPanels: async () => {
        bootOrder.push("refresh");
      },
      syncLayout: () => {
        bootOrder.push("layout");
      },
      activatePrimaryInput: () => {
        bootOrder.push("input");
      },
      updateFooterHint: () => {
        bootOrder.push("footer");
      },
      screen: {
        focused: { type: "textbox" },
        renders: 0,
        render() {
          bootOrder.push("render");
        },
      } as never,
      onReady: () => {
        bootOrder.push("ready");
      },
    });

    expect(activities).toEqual(["Booted", "Tip", "boot log"]);
    expect(responses).toEqual([{ label: "Helm Ready", body: "Welcome" }]);
    expect(transportBox.content).toBe("transport");
    expect(executionBox.content).toBe("execution");
    expect(bootOrder).toEqual([
      "deck",
      "theme",
      "refresh",
      "layout",
      "input",
      "footer",
      "render",
      "ready",
    ]);
    expect(traces).toContain("tui:before-refresh");
    expect(traces).toContain("tui:after-final-render");
  });

  it("reports recoverable deferred hydration failures through notices and refreshes", async () => {
    const activities: string[] = [];
    const notices: string[] = [];
    const refreshes: number[] = [];

    scheduleTuiDeferredHydration({
      context: {
        ensureDeferredHydration: async () => {
          throw new Error("recoverable issue");
        },
      } as unknown as AppContext,
      isScreenDestroyed: () => false,
      isBenignShutdownError: () => false,
      isRecoverableProviderError: () => true,
      formatRecoverableProviderError: (error) =>
        error instanceof Error ? error.message : String(error),
      logFatal: () => {},
      appendActivity: (_kind, message) => {
        activities.push(message);
      },
      pushNotice: (_kind, message) => {
        notices.push(message);
      },
      scheduleRefreshPanels: (delayMs = 120) => {
        refreshes.push(delayMs);
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(activities).toEqual(["recoverable issue"]);
    expect(notices).toEqual([
      "Deferred startup hit a recoverable error: recoverable issue",
    ]);
    expect(refreshes).toEqual([0]);
  });

  it("waits for destroy and distinguishes expected vs unexpected shutdown", async () => {
    let destroyHandler: (() => void) | undefined;
    let marked = 0;
    let cleaned = 0;
    let unexpected = 0;
    let shuttingDown = false;

    const pending = waitForTuiDestroy({
      screen: {
        on(event: string, handler: () => void) {
          if (event === "destroy") {
            destroyHandler = handler;
          }
        },
      } as never,
      markScreenDestroyed: () => {
        marked += 1;
      },
      cleanup: () => {
        cleaned += 1;
      },
      isShuttingDown: () => shuttingDown,
      getExitCode: () => 0,
      onUnexpectedDestroy: () => {
        unexpected += 1;
      },
    });

    destroyHandler?.();
    await expect(pending).resolves.toBe("unexpected");
    expect(marked).toBe(1);
    expect(cleaned).toBe(1);
    expect(unexpected).toBe(1);

    const second = waitForTuiDestroy({
      screen: {
        on(event: string, handler: () => void) {
          if (event === "destroy") {
            destroyHandler = handler;
          }
        },
      } as never,
      markScreenDestroyed: () => {},
      cleanup: () => {},
      isShuttingDown: () => true,
      getExitCode: () => 7,
      onUnexpectedDestroy: () => {
        throw new Error("should not fire");
      },
    });

    shuttingDown = true;
    destroyHandler?.();
    await expect(second).resolves.toBe(7);
  });
});
