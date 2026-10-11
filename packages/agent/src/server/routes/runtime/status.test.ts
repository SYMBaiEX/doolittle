import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { AGENT_REGISTRY_INSTALL_FAILURE } from "@/runtime/native/agent-sdk";
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

describe("registry installation responses", () => {
  const url = new URL("http://localhost/runtime/registry/install");
  const request = () =>
    new Request(url, {
      method: "POST",
      body: JSON.stringify({
        name: "@elizaos/plugin-browser",
        packageName: "@elizaos/plugin-browser",
        version: "2.0.3-beta.7",
        approved: true,
      }),
    });

  it.each(["returned", "thrown"] as const)(
    "does not disclose a %s installer diagnostic",
    async (failureKind) => {
      const diagnostic =
        "registry-token-fixture at /private/operator/plugins/plugin-browser";
      const installRegistryExtension = vi.fn(async () => {
        if (failureKind === "thrown") throw new Error(diagnostic);
        return { ok: false, status: 422, error: diagnostic };
      });
      const context = {
        services: { agentSdk: { installRegistryExtension } },
      } as unknown as AppContext;

      const response = await handleRuntimeStatusRoutes(context, request(), url);
      expect(response?.status).toBe(422);
      const payload = await response?.json();
      expect(payload).toMatchObject({ error: AGENT_REGISTRY_INSTALL_FAILURE });
      expect(JSON.stringify(payload)).not.toContain("registry-token-fixture");
      expect(JSON.stringify(payload)).not.toContain("/private/operator");
      expect(installRegistryExtension).toHaveBeenCalledOnce();
    },
  );

  it.each([403, 409])(
    "preserves actionable policy rejection status %s",
    async (status) => {
      const result = {
        ok: false,
        status,
        error: "Review the approved policy.",
      };
      const context = {
        services: {
          agentSdk: { installRegistryExtension: async () => result },
        },
      } as unknown as AppContext;

      const response = await handleRuntimeStatusRoutes(context, request(), url);
      expect(response?.status).toBe(status);
      await expect(response?.json()).resolves.toEqual(result);
    },
  );
});
