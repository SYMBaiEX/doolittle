// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ desktopRequest: vi.fn() }));

vi.mock("./eliza-client", () => ({
  desktopRequest: mocks.desktopRequest,
}));

import { useDesktopAcpEditorBridge } from "./desktop-acp-client";

let root: Root | undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  mocks.desktopRequest.mockReset();
});

describe("useDesktopAcpEditorBridge recovery", () => {
  it("offers an in-place retry after the initial ACP session fails", async () => {
    let attempts = 0;
    mocks.desktopRequest.mockImplementation(async (path: string) => {
      if (path !== "/acp/session/new") return {};
      attempts += 1;
      if (attempts === 1) throw new Error("runtime starting");
      return { session: { sessionId: "acp:recovered" } };
    });

    let bridge: ReturnType<typeof useDesktopAcpEditorBridge> | undefined;
    function Probe() {
      bridge = useDesktopAcpEditorBridge({
        active: true,
        workspacePath: "/workspace-initial",
      });
      useEffect(() => undefined, []);
      return null;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(Probe));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(bridge?.phase).toBe("degraded");
    expect(bridge?.error).toBe("runtime starting");

    await act(async () => {
      await bridge?.retryConnection();
    });

    expect(bridge?.phase).toBe("connected");
    expect(bridge?.sessionId).toBe("acp:recovered");
    expect(attempts).toBe(2);
    host.remove();
  });

  it("returns to idle after the ACP cancel endpoint acknowledges", async () => {
    const promptResponse = deferred<unknown>();
    mocks.desktopRequest.mockImplementation(async (path: string) => {
      if (path === "/acp/session/new") {
        return { session: { sessionId: "acp:running" } };
      }
      if (path === "/acp/initialize") {
        return { initialized: { agentCapabilities: {} } };
      }
      if (path === "/acp/session/prompt") return promptResponse.promise;
      if (path === "/acp/session/cancel") return { cancelled: true };
      return {};
    });

    let bridge: ReturnType<typeof useDesktopAcpEditorBridge> | undefined;
    function Probe() {
      bridge = useDesktopAcpEditorBridge({
        active: true,
        workspacePath: "/workspace-cancel",
      });
      return null;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(Probe));
      await Promise.resolve();
      await Promise.resolve();
    });

    let promptPromise: Promise<unknown> | undefined;
    await act(async () => {
      promptPromise = bridge?.prompt("Inspect the selected file");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(bridge?.promptPhase).toBe("running");

    await act(async () => {
      await bridge?.cancel();
    });

    expect(bridge?.promptPhase).toBe("idle");
    expect(bridge?.stopReason).toBe("cancelled");

    promptResponse.resolve({ result: { stopReason: "cancelled" } });
    await act(async () => {
      await promptPromise;
    });
    host.remove();
  });

  it("degrades and offers reconnection when a prompt loses its runtime session", async () => {
    let sessionAttempts = 0;
    let promptAttempts = 0;
    mocks.desktopRequest.mockImplementation(async (path: string) => {
      if (path === "/acp/initialize") {
        return { initialized: { agentCapabilities: {} } };
      }
      if (path === "/acp/session/new") {
        sessionAttempts += 1;
        return {
          session: {
            sessionId: sessionAttempts === 1 ? "acp:stale" : "acp:reconnected",
          },
        };
      }
      if (path === "/acp/session/prompt") {
        promptAttempts += 1;
        throw new Error("ACP session not found: acp:stale");
      }
      return {};
    });

    let bridge: ReturnType<typeof useDesktopAcpEditorBridge> | undefined;
    function Probe() {
      bridge = useDesktopAcpEditorBridge({
        active: true,
        workspacePath: "/workspace-stale-prompt",
      });
      return null;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(Probe));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await bridge?.prompt("Inspect the selected file");
    });

    expect(bridge?.phase).toBe("degraded");
    expect(bridge?.sessionId).toBe("");
    expect(bridge?.promptPhase).toBe("idle");
    expect(bridge?.error).toBe(
      "The runtime restarted. Reconnect the ACP editor session.",
    );
    expect(bridge?.promptError).toBe("ACP session not found: acp:stale");
    expect(promptAttempts).toBe(1);

    await act(async () => {
      await bridge?.retryConnection();
    });

    expect(bridge?.phase).toBe("connected");
    expect(bridge?.sessionId).toBe("acp:reconnected");
    expect(promptAttempts).toBe(1);
    host.remove();
  });
});
