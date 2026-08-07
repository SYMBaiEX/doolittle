import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import type { RuntimeSettings } from "@/services/settings/runtime-settings";
import { SettingsService } from "@/services/settings-service";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function makeDefaults(): RuntimeSettings {
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
      remoteSyncExclude: [".git", "node_modules"],
      remoteArtifactPaths: [".doolittle/remote-artifacts"],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "doolittle-workspace",
      dockerImage: "ghcr.io/nubjs/nub:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: ["PATH", "HOME"],
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

describe("SettingsService", () => {
  test("persists and defaults the ui theme", () => {
    const dir = mkdtempSync(join(tmpdir(), "eliza-settings-"));
    tempDirs.push(dir);
    const service = new SettingsService(dir, makeDefaults());

    expect(service.get().ui.theme).toBe("orange");

    const updated = service.set("ui.theme", "matrix");
    expect(updated.ui.theme).toBe("matrix");

    const reloaded = new SettingsService(dir, makeDefaults());
    expect(reloaded.get().ui.theme).toBe("matrix");
  });

  test("persists a group of related settings in one update", () => {
    const dir = mkdtempSync(join(tmpdir(), "eliza-settings-"));
    tempDirs.push(dir);
    const service = new SettingsService(dir, makeDefaults());

    const updated = service.setMany([
      { path: "model.provider", value: "ollama" },
      { path: "model.model", value: "granite4.1:3b" },
      { path: "model.baseUrl", value: "http://127.0.0.1:11434" },
      { path: "model.reasoningEffort", value: "medium" },
    ]);

    expect(updated.model).toMatchObject({
      provider: "ollama",
      model: "granite4.1:3b",
      baseUrl: "http://127.0.0.1:11434",
      reasoningEffort: "medium",
    });
    const reloaded = new SettingsService(dir, makeDefaults());
    expect(reloaded.get().model).toEqual(updated.model);
  });

  test("does not persist unsupported reasoning effort values", () => {
    const dir = mkdtempSync(join(tmpdir(), "eliza-settings-"));
    tempDirs.push(dir);
    const service = new SettingsService(dir, makeDefaults());

    const updated = service.set("model.reasoningEffort", "unbounded");

    expect(updated.model.reasoningEffort).toBeUndefined();
  });
});
