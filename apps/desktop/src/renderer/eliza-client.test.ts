import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgentTransportRequest,
  AgentTransportResponse,
} from "../shared/contracts";
import { desktopAgentTransport, desktopRequest } from "./eliza-client";

const originalWindow = (globalThis as { window?: unknown }).window;

function installTransport(
  requestAgent: (
    request: AgentTransportRequest,
  ) => Promise<AgentTransportResponse>,
): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { doolittle: { requestAgent } },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

describe("desktop Eliza client transport", () => {
  it("routes JSON requests through the official Eliza transport contract", async () => {
    const requestAgent = vi.fn(
      async (
        request: AgentTransportRequest,
      ): Promise<AgentTransportResponse> => ({
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ready: true, path: request.path }),
      }),
    );
    installTransport(requestAgent);

    await expect(
      desktopRequest<{ ready: boolean; path: string }>("/settings", "POST", {
        reason: "operator",
      }),
    ).resolves.toEqual({
      ready: true,
      path: "/settings",
    });

    expect(requestAgent).toHaveBeenCalledOnce();
    expect(requestAgent.mock.calls[0]?.[0]).toMatchObject({
      path: "/settings",
      method: "POST",
      body: JSON.stringify({ reason: "operator" }),
      headers: {
        "content-type": "application/json",
      },
    });
    expect(
      requestAgent.mock.calls[0]?.[0].headers["x-elizaos-client-id"],
    ).toMatch(/^ui-/u);
  });

  it("preserves HTTP failures as Eliza ApiError metadata", async () => {
    installTransport(async () => ({
      status: 429,
      statusText: "Too Many Requests",
      headers: {
        "content-type": "application/json",
        "retry-after": "7",
      },
      body: JSON.stringify({
        error: "The agent is busy.",
        code: "rate_limit_exceeded",
      }),
    }));

    await expect(desktopRequest("/runtime/status")).rejects.toMatchObject({
      name: "ApiError",
      kind: "http",
      status: 429,
      path: "/runtime/status",
      message: "The agent is busy.",
      code: "rate_limit_exceeded",
      retryAfter: 7,
    });
  });

  it("rejects non-local targets before they cross the preload bridge", async () => {
    installTransport(async () => {
      throw new Error("should not run");
    });

    await expect(
      desktopAgentTransport.request("https://example.com/health", {
        method: "GET",
      }),
    ).rejects.toThrow(/only accepts local agent URLs/u);
  });

  it("honors Eliza request cancellation while IPC work is pending", async () => {
    installTransport(
      async () =>
        new Promise<AgentTransportResponse>(() => {
          // The main-process request may still finish, but the Eliza caller must
          // stop awaiting it as soon as its request signal is cancelled.
        }),
    );
    const controller = new AbortController();
    const pending = desktopAgentTransport.request(
      "http://desktop.local/health",
      {
        method: "GET",
        signal: controller.signal,
      },
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("forwards cancellation through the desktop client helper", async () => {
    installTransport(
      async () =>
        new Promise<AgentTransportResponse>(() => {
          // The official resource hook aborts this request on dependency changes.
        }),
    );
    const controller = new AbortController();
    const pending = desktopRequest(
      "/runtime/status",
      "GET",
      undefined,
      controller.signal,
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({
      name: "ApiError",
      path: "/runtime/status",
      message: "Request aborted",
    });
  });
});
