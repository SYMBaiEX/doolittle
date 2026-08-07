import { describe, expect, it } from "vitest";
import { normalizeRuntimeSettings } from "@/services/settings/normalization";
import type {
  ParsedRuntimeSettings,
  RuntimeSettings,
} from "@/services/settings/runtime-settings";

function createDefaults(): RuntimeSettings {
  return {
    model: {
      provider: "openai",
      model: "gpt-5.4",
      baseUrl: "",
      temperature: 0.2,
      maxTokens: 4096,
    },
    gateway: {
      sessionTimeoutMinutes: 120,
      mirrorResponsesToHistory: true,
    },
    execution: {
      backend: "local",
      remoteSyncMode: "mirror",
      remoteSyncInclude: ["**/*"],
      remoteSyncExclude: [".git"],
      remoteArtifactPaths: [".doolittle/remote-artifacts"],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "workspace",
      dockerImage: "ghcr.io/nubjs/nub:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: ["PATH"],
      singularityImage: "",
      daytonaTarget: "",
      daytonaCommand: "",
      daytonaShell: "/bin/sh",
      daytonaWorkspacePath: "/workspace",
      daytonaSnapshot: "",
      daytonaBootstrapCommand: "",
      daytonaStatusCommand: "",
      daytonaInspectCommand: "",
      modalTarget: "",
      modalCommand: "",
      modalShell: "/bin/bash",
      modalWorkspacePath: "/workspace",
      modalEnvironment: "",
      modalBootstrapCommand: "",
      modalStatusCommand: "",
      modalInspectCommand: "",
      commandTimeoutMs: 30_000,
      healthTimeoutMs: 5_000,
      containerCpuLimit: "2",
      containerMemoryLimit: "2g",
      containerPidsLimit: 256,
      containerReadOnlyRoot: true,
      sshHost: "",
      sshUser: "",
      sshPath: "",
      sshPort: 22,
      sshKeyPath: "",
      sshStrictHostKeyChecking: false,
    },
    mcp: {
      servers: {},
      maxRetries: 2,
    },
    agent: {
      runDepth: "standard",
      maxIterations: 45,
      toolProgressMode: "new",
    },
    ui: {
      theme: "orange",
    },
  };
}

function createParsed(): ParsedRuntimeSettings {
  return {
    model: {
      provider: "openai-compatible",
      model: "gpt-5.4",
      baseUrl: "",
      temperature: 0.2,
      maxTokens: 4096,
    },
    gateway: {
      sessionTimeoutMinutes: 120,
      mirrorResponsesToHistory: true,
    },
  } as unknown as ParsedRuntimeSettings;
}

describe("normalizeRuntimeSettings", () => {
  it("rewrites legacy provider names and hydrates missing sections", () => {
    const result = normalizeRuntimeSettings(createParsed(), createDefaults());

    expect(result.dirty).toBe(true);
    expect(result.settings.model.provider).toBe("openai");
    expect(result.settings.execution.remoteSyncMode).toBe("mirror");
    expect(result.settings.mcp.maxRetries).toBe(2);
    expect(result.settings.agent.runDepth).toBe("standard");
    expect(result.settings.ui.theme).toBe("orange");
  });

  it("hydrates empty execution arrays from defaults", () => {
    const parsed = createParsed();
    parsed.execution = {
      backend: "local",
      remoteSyncInclude: [],
      remoteSyncExclude: [],
      remoteArtifactPaths: [],
      dockerEnvPassthrough: [],
    } as Partial<RuntimeSettings["execution"]>;

    const result = normalizeRuntimeSettings(parsed, createDefaults());

    expect(result.settings.execution.remoteSyncInclude).toEqual(["**/*"]);
    expect(result.settings.execution.remoteSyncExclude).toEqual([".git"]);
    expect(result.settings.execution.remoteArtifactPaths).toEqual([
      ".doolittle/remote-artifacts",
    ]);
    expect(result.settings.execution.dockerEnvPassthrough).toEqual(["PATH"]);
  });

  it("migrates the legacy command bridge into official Eliza MCP settings", () => {
    const parsed = createParsed();
    parsed.mcp = {
      serverCommand: "npx -y @modelcontextprotocol/server-filesystem .",
      timeoutMs: 12_000,
    };

    const result = normalizeRuntimeSettings(parsed, createDefaults());

    expect(result.dirty).toBe(true);
    expect(result.settings.mcp).toEqual({
      servers: {
        doolittle: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
          timeoutInMillis: 12_000,
        },
      },
      maxRetries: 2,
    });
  });

  it("removes stale or malformed reasoning effort while preserving supported values", () => {
    const parsed = createParsed();
    parsed.model.reasoningEffort = "medium";
    expect(
      normalizeRuntimeSettings(parsed, createDefaults()).settings.model,
    ).toMatchObject({ reasoningEffort: "medium" });

    const malformed = createParsed();
    malformed.model.reasoningEffort = "unbounded" as never;
    const result = normalizeRuntimeSettings(malformed, createDefaults());
    expect(result.dirty).toBe(true);
    expect(result.settings.model.reasoningEffort).toBeUndefined();
  });
});
