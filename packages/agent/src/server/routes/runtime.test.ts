import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleRuntimeRoutes } from "@/server/routes/runtime/index";

function createContext() {
  const config = {
    agentName: "Doolittle Test",
    mode: "api",
    offlineBootstrapMode: true,
    openAiApiKey: "",
    anthropicApiKey: "",
    telegramBotToken: "",
    elizaCloudApiKey: "",
    elizaCloudEnabled: false,
    useLinkedCodexAuth: false,
    useLinkedClaudeCodeAuth: false,
    workspaceDir: process.cwd(),
  };
  return {
    config,
    runtime: {},
    services: {
      workspace: {
        root: () => config.workspaceDir,
      },
      repository: {
        invalidateWorkspace: () => undefined,
      },
      terminal: {
        invalidateWorkspace: () => undefined,
      },
      skills: {
        invalidateWorkspace: () => undefined,
      },
      settings: {
        get: () => ({
          model: {
            provider: "local",
            model: "gpt-test",
            reasoningEffort: "medium",
          },
        }),
      },
      startupState: {
        getSnapshot: () => ({
          phase: "ready",
        }),
      },
      gatewayConfig: {
        transports: [],
      },
      nativeRegistry: {
        browser: "plugin",
      },
      nativeOwnership: {
        controlPlane: () => ({
          transportControl: {
            transportInventory: [{ platform: "telegram", enabled: false }],
            totals: { enabled: 0, disabled: 1 },
            messagingBridge: { source: "runtime", available: true },
          },
          serviceResolution: { browser: "plugin" },
          pluginManager: { available: true },
          identity: { source: "runtime" },
        }),
      },
      agentSdk: {
        compatibility: async () => ({ ok: true }),
        searchRegistry: async (query: string) => ({ query, mode: "search" }),
        registry: async (refresh: boolean) => ({ refresh, mode: "registry" }),
        installRegistryExtension: async (input: unknown) => ({
          ok: true,
          status: 200,
          input,
        }),
      },
      ecosystem: {
        optionalSkillPacks: () => ["pack-optional"],
      },
      operator: {
        setupSummary: async () => ({ ok: true }),
      },
    },
  } as unknown as AppContext;
}

describe("handleRuntimeRoutes", () => {
  it("leaves plugin-owned health routing to the Eliza route bridge", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/health"),
      new URL("http://localhost/health"),
    );

    expect(response).toBeNull();
  });

  it("switches the live workspace without rebuilding the runtime context", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "doolittle-workspace-"));
    const canonicalWorkspaceDir = realpathSync(workspaceDir);
    const context = createContext();
    const runtime = context.runtime;
    try {
      const response = await handleRuntimeRoutes(
        context,
        new Request("http://localhost/runtime/workspace", {
          method: "POST",
          body: JSON.stringify({ workspaceDir }),
          headers: { "content-type": "application/json" },
        }),
        new URL("http://localhost/runtime/workspace"),
      );

      expect(response?.status).toBe(200);
      await expect(response?.json()).resolves.toEqual({
        workspaceDir: canonicalWorkspaceDir,
        processId: process.pid,
      });
      expect(context.config.workspaceDir).toBe(canonicalWorkspaceDir);
      expect(context.runtime).toBe(runtime);
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("returns stable 400 responses for malformed workspace switches", async () => {
    const context = createContext();
    const malformed = await handleRuntimeRoutes(
      context,
      new Request("http://localhost/runtime/workspace", {
        method: "POST",
        body: "{",
      }),
      new URL("http://localhost/runtime/workspace"),
    );
    const arrayBody = await handleRuntimeRoutes(
      context,
      new Request("http://localhost/runtime/workspace", {
        method: "POST",
        body: JSON.stringify([]),
      }),
      new URL("http://localhost/runtime/workspace"),
    );

    expect(malformed?.status).toBe(400);
    await expect(malformed?.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(arrayBody?.status).toBe(400);
    await expect(arrayBody?.json()).resolves.toEqual({
      error: "JSON body must be an object",
    });
  });

  it("returns runtime status with ownership details", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/runtime/status"),
      new URL("http://localhost/runtime/status"),
    );

    const body = (await response?.json()) as {
      provider: string;
      model: string;
      reasoningEffort?: string;
      native: {
        ownership: {
          serviceResolution: Record<string, string>;
        };
      };
    };

    expect(body.provider).toBe("local");
    expect(body.model).toBe("gpt-test");
    expect(body.reasoningEffort).toBe("medium");
    expect(body.native.ownership.serviceResolution).toEqual({
      browser: "plugin",
    });
  });

  it("returns the plugin catalog without resolving unrelated ownership state", async () => {
    const context = createContext();
    const controlPlane = vi.spyOn(
      context.services.nativeOwnership,
      "controlPlane",
    );
    const response = await handleRuntimeRoutes(
      context,
      new Request("http://localhost/runtime/plugins?view=catalog"),
      new URL("http://localhost/runtime/plugins?view=catalog"),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      catalog: expect.any(Array),
    });
    expect(controlPlane).not.toHaveBeenCalled();
  });

  it("returns the shared slash-command catalog for desktop completion", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/commands/catalog"),
      new URL("http://localhost/commands/catalog"),
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      commands: Array<{
        command: string;
        description: string;
        aliases?: string[];
      }>;
    };
    expect(body.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: "/status",
          description: expect.any(String),
        }),
      ]),
    );
    expect(body.commands).toContainEqual(
      expect.objectContaining({
        command: "/gateway-readiness",
        aliases: expect.arrayContaining(["/gateway readiness"]),
      }),
    );
  });

  it("rejects invalid account providers", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/accounts/use", {
        method: "POST",
        body: JSON.stringify({ provider: "nope" }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/accounts/use"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "provider must be elizacloud, codex, claude-code, or devin",
    });
  });

  it("delegates runtime registry search", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/runtime/registry?query=browser"),
      new URL("http://localhost/runtime/registry?query=browser"),
    );

    await expect(response?.json()).resolves.toEqual({
      query: "browser",
      mode: "search",
    });
  });

  it("bounds registry search and refreshes before a combined hard-refresh query", async () => {
    const context = createContext();
    const registry = vi.spyOn(context.services.agentSdk, "registry");
    const searchRegistry = vi.spyOn(
      context.services.agentSdk,
      "searchRegistry",
    );

    const refreshed = await handleRuntimeRoutes(
      context,
      new Request(
        "http://localhost/runtime/registry?query=browser&refresh=true",
      ),
      new URL("http://localhost/runtime/registry?query=browser&refresh=true"),
    );
    expect(refreshed?.status).toBe(200);
    expect(registry).toHaveBeenCalledWith(true);
    expect(searchRegistry).toHaveBeenCalledWith("browser");

    const oversized = await handleRuntimeRoutes(
      context,
      new Request(`http://localhost/runtime/registry?query=${"x".repeat(129)}`),
      new URL(`http://localhost/runtime/registry?query=${"x".repeat(129)}`),
    );
    expect(oversized?.status).toBe(400);
  });

  it("requires explicit approval and delegates registry installation", async () => {
    const context = createContext();
    const rejected = await handleRuntimeRoutes(
      context,
      new Request("http://localhost/runtime/registry/install", {
        method: "POST",
        body: JSON.stringify({ name: "@elizaos/plugin-browser" }),
      }),
      new URL("http://localhost/runtime/registry/install"),
    );
    expect(rejected?.status).toBe(400);

    const approved = await handleRuntimeRoutes(
      context,
      new Request("http://localhost/runtime/registry/install", {
        method: "POST",
        body: JSON.stringify({
          name: "@elizaos/plugin-browser",
          packageName: "@elizaos/plugin-browser",
          version: "2.0.3-beta.7",
          approved: true,
        }),
      }),
      new URL("http://localhost/runtime/registry/install"),
    );
    expect(approved?.status).toBe(200);
    await expect(approved?.json()).resolves.toMatchObject({
      ok: true,
      input: {
        name: "@elizaos/plugin-browser",
        packageName: "@elizaos/plugin-browser",
        version: "2.0.3-beta.7",
        approved: true,
      },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/not-runtime"),
      new URL("http://localhost/not-runtime"),
    );

    expect(response).toBeNull();
  });
});
