import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import { CloudStoreManager } from "../cloud/store";
import { createCloudExecutionBackends } from "./backends";

function makeSettings(): RuntimeSettings {
  return {
    model: {
      provider: "offline",
      model: "local",
      baseUrl: "http://localhost",
      temperature: 0.2,
      maxTokens: 400,
    },
    gateway: {
      sessionTimeoutMinutes: 120,
      mirrorResponsesToHistory: true,
    },
    execution: {
      backend: "local",
      remoteSyncMode: "mirror",
      remoteSyncInclude: ["packages/agent/src/**"],
      remoteSyncExclude: [],
      remoteArtifactPaths: [".doolittle/remote-artifacts"],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "workspace",
      dockerImage: "oven/bun:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: ["PATH", "HOME"],
      singularityImage: "",
      daytonaTarget: "",
      daytonaCommand: "__missing_daytona_command__",
      daytonaShell: "/bin/sh",
      daytonaWorkspacePath: "/workspace",
      daytonaSnapshot: "",
      daytonaBootstrapCommand: "",
      daytonaStatusCommand: "",
      daytonaInspectCommand: "",
      modalTarget: "",
      modalCommand: "__missing_modal_command__",
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
      serverCommand: "",
      timeoutMs: 5_000,
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

describe("terminal cloud backends namespace", () => {
  const tempRoots = new Set<string>();

  afterEach(() => {
    for (const root of tempRoots) {
      rmSync(root, { recursive: true, force: true });
    }
    tempRoots.clear();
  });

  function createStoreRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "doolittle-terminal-cloud-"));
    tempRoots.add(root);
    return root;
  }

  it("creates daytona and modal backend facades", () => {
    const store = new CloudStoreManager(
      join(createStoreRoot(), "cloud-sessions.json"),
    );
    const backends = createCloudExecutionBackends(store);
    expect(backends.has("daytona")).toBe(true);
    expect(backends.has("modal")).toBe(true);
  });

  it("returns helpful failures when targets are missing", async () => {
    const store = new CloudStoreManager(
      join(createStoreRoot(), "cloud-sessions.json"),
    );
    const backends = createCloudExecutionBackends(store);
    const settings = makeSettings();

    const daytona = backends.get("daytona");
    const modal = backends.get("modal");
    if (!daytona || !modal) {
      throw new Error("cloud backends are missing from helper map");
    }

    const daytonaResult = await daytona.run("printf ok", {
      cwd: "/tmp",
      timeoutMs: 1_000,
      settings,
    });
    const modalResult = await modal.run("printf ok", {
      cwd: "/tmp",
      timeoutMs: 1_000,
      settings,
    });

    expect(daytonaResult.exitCode).toBe(1);
    expect(modalResult.exitCode).toBe(1);
    expect(daytonaResult.stderr).toContain("Daytona backend requires");
    expect(modalResult.stderr).toContain("Modal backend requires");
  });
});
