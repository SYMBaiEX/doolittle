import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
      },
      ecosystem: {
        benchmarkPacks: () => ["pack-a"],
        distributionChannels: () => ["stable"],
        optionalSkillPacks: () => ["pack-optional"],
        modelingProfiles: () => ["profile-a"],
      },
      operator: {
        setupSummary: async () => ({ ok: true }),
      },
    },
  } as unknown as AppContext;
}

describe("handleRuntimeRoutes", () => {
  it("returns health status", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/health"),
      new URL("http://localhost/health"),
    );

    expect(response).not.toBeNull();
    await expect(response?.json()).resolves.toEqual({
      status: "ok",
      name: "Doolittle Test",
      mode: "api",
      processId: process.pid,
      workspaceDir: process.cwd(),
    });
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

  it("returns runtime status with ownership details", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/runtime/status"),
      new URL("http://localhost/runtime/status"),
    );

    const body = (await response?.json()) as {
      provider: string;
      model: string;
      native: {
        ownership: {
          serviceResolution: Record<string, string>;
        };
      };
    };

    expect(body.provider).toBe("local");
    expect(body.model).toBe("gpt-test");
    expect(body.native.ownership.serviceResolution).toEqual({
      browser: "plugin",
    });
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

  it("returns null for unrelated routes", async () => {
    const response = await handleRuntimeRoutes(
      createContext(),
      new Request("http://localhost/not-runtime"),
      new URL("http://localhost/not-runtime"),
    );

    expect(response).toBeNull();
  });
});
