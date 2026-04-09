import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import { CloudStoreManager } from "../cloud/store";
import { createModalExecutionBackend } from "./modal";

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
      modalTarget: "modal-target",
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

describe("modal cloud backend", () => {
  const roots = new Set<string>();

  it("returns a preview and missing-target run failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-modal-cloud-"));
    roots.add(root);
    const store = new CloudStoreManager(join(root, "cloud-sessions.json"));
    const backend = createModalExecutionBackend(store);
    const settings = makeSettings();

    const preview = backend.preview("printf ok", {
      cwd: root,
      timeoutMs: 1_000,
      settings,
    });
    expect(preview.backend).toBe("modal");
    expect(preview.ready).toBe(true);
    expect(preview.detail).toContain("Modal execution uses");

    const result = await backend.run("printf ok", {
      cwd: root,
      timeoutMs: 1_000,
      settings: {
        ...settings,
        execution: { ...settings.execution, modalTarget: "" },
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Modal backend requires");
  });

  it("cleans up its temp roots", () => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
    roots.clear();
    expect(roots.size).toBe(0);
  });
});
