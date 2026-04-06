import { describe, expect, it } from "bun:test";
import type { CliState } from "@/cli/execution";
import { installTuiRuntimeObservers } from "@/cli/tui-runtime-observers";
import type { AppContext } from "@/runtime/bootstrap";

function createEmitter<T>() {
  const listeners = new Set<(event: T) => void>();
  return {
    on(listener: (event: T) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(event: T) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

function createObserverContext() {
  const gateway = createEmitter<unknown>();
  const terminal = createEmitter<unknown>();
  const delegation = createEmitter<unknown>();
  const runController = createEmitter<unknown>();
  const startupState = createEmitter<unknown>();
  const sessions = createEmitter<unknown>();
  const apiTransport = createEmitter<unknown>();

  const context = {
    gateway: {
      onUpdate: gateway.on,
    },
    services: {
      terminal: {
        onUpdate: terminal.on,
      },
      delegation: {
        onUpdate: delegation.on,
      },
      runController: {
        onUpdate: runController.on,
      },
      startupState: {
        onUpdate: startupState.on,
      },
      sessions: {
        onActivity: sessions.on,
      },
      apiTransport: {
        onUpdate: apiTransport.on,
      },
    },
  } as unknown as AppContext;

  return {
    context,
    gateway,
    terminal,
    delegation,
    runController,
    startupState,
    sessions,
    apiTransport,
  };
}

describe("installTuiRuntimeObservers", () => {
  it("routes busy run updates into live tool events and notices", () => {
    const { context, runController } = createObserverContext();
    const state: CliState = {
      activeSessionId: "cli:test",
      notices: [],
    };
    const activities: string[] = [];
    const notices: string[] = [];
    const liveToolEvents: string[] = [];
    const refreshDelays: number[] = [];
    let liveResponseRefreshes = 0;

    installTuiRuntimeObservers({
      context,
      state,
      isBusy: () => true,
      appendActivity: (_kind, message) => {
        activities.push(message);
      },
      pushNotice: (_kind, message) => {
        notices.push(message);
      },
      pushLiveToolEvent: (detail) => {
        liveToolEvents.push(detail);
      },
      getLiveResponse: () => ({ pending: true }),
      refreshLiveResponse: () => {
        liveResponseRefreshes += 1;
      },
      scheduleRefreshPanels: (delayMs = 120) => {
        refreshDelays.push(delayMs);
      },
    });

    runController.emit({
      sessionId: "cli:test",
      type: "approvals",
      run: {
        progressMode: "verbose",
        pendingApprovals: 2,
        activeStream: "assistant",
      },
    });

    expect(notices).toEqual(["Pending execution approvals: 2"]);
    expect(liveToolEvents).toEqual(["pending approvals · 2"]);
    expect(activities).toEqual(["pending approvals · 2"]);
    expect(liveResponseRefreshes).toBe(1);
    expect(refreshDelays).toEqual([0]);
  });

  it("ignores active-session chat memory and tears down all observers", () => {
    const { context, gateway, sessions } = createObserverContext();
    const state: CliState = {
      activeSessionId: "cli:test",
      notices: [],
    };
    const activities: string[] = [];
    const refreshDelays: number[] = [];

    const dispose = installTuiRuntimeObservers({
      context,
      state,
      isBusy: () => false,
      appendActivity: (_kind, message) => {
        activities.push(message);
      },
      pushNotice: () => {},
      pushLiveToolEvent: () => {},
      getLiveResponse: () => undefined,
      refreshLiveResponse: () => {},
      scheduleRefreshPanels: (delayMs = 120) => {
        refreshDelays.push(delayMs);
      },
    });

    sessions.emit({
      sessionId: "cli:test",
      role: "assistant",
      detail: "skip me",
    });
    sessions.emit({
      sessionId: "cli:other",
      role: "tool",
      detail: "retain me",
    });
    gateway.emit({
      platform: "gateway",
      detail: "reject me later",
      kind: "reject",
    });

    expect(activities).toEqual(["retain me", "reject me later"]);
    expect(refreshDelays).toEqual([120, 120]);

    dispose();
    gateway.emit({
      platform: "gateway",
      detail: "after dispose",
      kind: "info",
    });

    expect(activities).toEqual(["retain me", "reject me later"]);
  });
});
