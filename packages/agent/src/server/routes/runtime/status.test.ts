import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleRuntimeStatusRoutes } from "./status";

const previous = {
  desktop: process.env.DOOLITTLE_DESKTOP_RUNTIME,
  token: process.env.DOOLITTLE_DESKTOP_CONTROL_TOKEN,
};
afterEach(() => {
  if (previous.desktop === undefined)
    delete process.env.DOOLITTLE_DESKTOP_RUNTIME;
  else process.env.DOOLITTLE_DESKTOP_RUNTIME = previous.desktop;
  if (previous.token === undefined)
    delete process.env.DOOLITTLE_DESKTOP_CONTROL_TOKEN;
  else process.env.DOOLITTLE_DESKTOP_CONTROL_TOKEN = previous.token;
});

describe("host-owned runtime execution stop", () => {
  it("denies callers without the private desktop capability before touching work", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    process.env.DOOLITTLE_DESKTOP_CONTROL_TOKEN = "private-test-token";
    const cancel = vi.fn();
    const context = {
      services: { runController: { cancelAllActiveRuns: cancel } },
    } as unknown as AppContext;
    const url = new URL("http://localhost/runtime/executions/stop-all");
    const response = await handleRuntimeStatusRoutes(
      context,
      new Request(url, { method: "POST" }),
      url,
    );
    expect(response?.status).toBe(403);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancels chat, protocol ACP, admitted SDK ACP, and terminal work for the owning process", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    process.env.DOOLITTLE_DESKTOP_CONTROL_TOKEN = "private-test-token";
    const cancelRuns = vi.fn(() => 2);
    const cancelProtocol = vi.fn(() => 1);
    const stopTerminals = vi.fn();
    const stopAdmitted = vi.fn(async () => 1);
    const context = {
      services: {
        runController: { cancelAllActiveRuns: cancelRuns },
        acp: { cancelAllProtocolSessions: cancelProtocol },
        terminal: { disposeInteractiveSessions: stopTerminals },
      },
      runtime: {
        getService: () => ({ stopAllAdmittedSessions: stopAdmitted }),
      },
    } as unknown as AppContext;
    const url = new URL("http://localhost/runtime/executions/stop-all");
    const response = await handleRuntimeStatusRoutes(
      context,
      new Request(url, {
        method: "POST",
        headers: { "x-doolittle-desktop-control-token": "private-test-token" },
      }),
      url,
    );
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      stopped: true,
      chatRuns: 2,
      protocolPrompts: 1,
      automaticAcpSessions: 1,
    });
    expect(cancelRuns).toHaveBeenCalledOnce();
    expect(cancelProtocol).toHaveBeenCalledOnce();
    expect(stopTerminals).toHaveBeenCalledOnce();
    expect(stopAdmitted).toHaveBeenCalledOnce();
  });
});
