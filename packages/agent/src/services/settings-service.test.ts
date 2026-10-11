import { spawnSync } from "node:child_process";
import {
  linkSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
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

  test("does not expose cached settings through setMany's return value", () => {
    const dir = mkdtempSync(join(tmpdir(), "eliza-settings-"));
    tempDirs.push(dir);
    const service = new SettingsService(dir, makeDefaults());
    const returned = service.setMany([{ path: "ui.theme", value: "matrix" }]);
    returned.ui.theme = "orange";
    returned.execution.remoteSyncInclude.push("mutated");
    expect(service.get().ui.theme).toBe("matrix");
    expect(service.get().execution.remoteSyncInclude).not.toContain("mutated");
    const reopened = new SettingsService(dir, makeDefaults());
    expect(reopened.get().ui.theme).toBe("matrix");
    expect(reopened.get().execution.remoteSyncInclude).not.toContain("mutated");
  });

  test("does not persist unsupported reasoning effort values", () => {
    const dir = mkdtempSync(join(tmpdir(), "eliza-settings-"));
    tempDirs.push(dir);
    const service = new SettingsService(dir, makeDefaults());

    const updated = service.set("model.reasoningEffort", "unbounded");

    expect(updated.model.reasoningEffort).toBeUndefined();
  });

  test.each([
    "",
    "model..provider",
    "model.__proto__.polluted",
    "model.constructor.prototype.polluted",
    "model.provider.",
  ])("rejects unsafe setting path %j for every caller", (path) => {
    const dir = mkdtempSync(join(tmpdir(), "eliza-settings-"));
    tempDirs.push(dir);
    const service = new SettingsService(dir, makeDefaults());

    expect(() => service.set(path, "unsafe")).toThrow(
      "Setting path is not valid.",
    );
    expect(service.get()).toEqual(makeDefaults());
  });

  test("invalidates cache after same-mtime replacement and rejects linked or oversized settings", () => {
    const dir = mkdtempSync(join(tmpdir(), "eliza-settings-"));
    tempDirs.push(dir);
    const service = new SettingsService(dir, makeDefaults());
    const path = join(dir, "settings.json");
    const before = service.get();
    const replacement = join(dir, "replacement.json");
    writeFileSync(
      replacement,
      JSON.stringify({ ...before, ui: { theme: "matrix" } }),
    );
    const oldTime = new Date();
    utimesSync(replacement, oldTime, oldTime);
    // Rename is an atomic replacement even when a producer preserves timestamps.
    renameSync(replacement, path);
    expect(service.get().ui.theme).toBe("matrix");
    rmSync(path);
    symlinkSync(replacement, path);
    expect(() => service.get()).toThrow();
    rmSync(path);
    writeFileSync(path, "x".repeat(1024 * 1024 + 1));
    expect(() => service.get()).toThrow();
    rmSync(path);
    writeFileSync(path, JSON.stringify(before));
    linkSync(path, join(dir, "linked.json"));
    expect(() => service.get()).toThrow();
  });

  test("rejects a setting larger than the read cap before replacing the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "eliza-settings-"));
    tempDirs.push(dir);
    const service = new SettingsService(dir, makeDefaults());
    const before = service.get();
    expect(() => service.set("model.model", "x".repeat(1024 * 1024))).toThrow(
      "byte limit",
    );
    expect(service.get()).toEqual(before);
  });

  test.skipIf(process.platform === "win32")(
    "rejects a settings FIFO without blocking",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "eliza-settings-fifo-"));
      tempDirs.push(dir);
      const service = new SettingsService(dir, makeDefaults());
      const path = join(dir, "settings.json");
      rmSync(path);
      const result = spawnSync("mkfifo", [path]);
      if (result.error || result.status !== 0)
        throw new Error("mkfifo unavailable");
      expect(() => service.get()).toThrow();
    },
  );
});
