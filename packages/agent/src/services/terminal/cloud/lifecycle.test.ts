import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import { buildCloudProfile, buildHealthLimits } from "../planning";
import {
  buildCloudPreviewLifecycle,
  buildUnavailableCloudHealth,
  recordCloudRunLifecycle,
} from "./lifecycle";
import { CloudStoreManager } from "./store";

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
      remoteSyncInclude: ["packages/agent/src/**", "packages/skills/src/**"],
      remoteSyncExclude: [".git", ".doolittle", "node_modules"],
      remoteArtifactPaths: [".doolittle/remote-artifacts"],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "doolittle-workspace",
      dockerImage: "oven/bun:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: ["PATH", "HOME"],
      singularityImage: "",
      daytonaTarget: "sandbox-dev",
      daytonaCommand: "daytona",
      daytonaShell: "/bin/sh",
      daytonaWorkspacePath: "/workspace",
      daytonaSnapshot: "snapshot-dev",
      daytonaBootstrapCommand: "",
      daytonaStatusCommand: "",
      daytonaInspectCommand: "",
      modalTarget: "sandbox-prod",
      modalCommand: "modal",
      modalShell: "/bin/bash",
      modalWorkspacePath: "/workspace",
      modalEnvironment: "sandbox-prod-env",
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

describe("cloud lifecycle", () => {
  const tempRoots = new Set<string>();

  afterEach(() => {
    for (const root of tempRoots) {
      rmSync(root, { recursive: true, force: true });
    }
    tempRoots.clear();
  });

  function createStore() {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-terminal-cloud-lifecycle-"),
    );
    tempRoots.add(root);
    return new CloudStoreManager(join(root, "cloud-sessions.json"));
  }

  it("builds preview records with refreshed session metadata", () => {
    const settings = makeSettings();
    const cloudState = createStore();
    const cloud = buildCloudProfile("daytona", settings, "/workspace/root");

    const preview = buildCloudPreviewLifecycle({
      backend: "daytona",
      cloudState,
      cloud,
      command: "printf ok",
      cwd: "/workspace/root",
      timeoutMs: 10_000,
      argv: ["daytona", "exec", "printf ok"],
      ready: true,
      detail: "Daytona preview detail",
      summary: "Daytona preview planned.",
      diagnostics: ["daytona is configured"],
      checks: [],
      bootstrap: ["install daytona"],
    });

    expect(preview.backend).toBe("daytona");
    expect(preview.command).toBe("printf ok");
    expect(preview.cloudSession?.lastCommand).toBe("printf ok");
    expect(preview.cloudSession?.lastPreviewAt).toBeTruthy();
    expect(preview.cloudSnapshot?.event).toBe("preview");
    expect(preview.cloudSnapshot?.summary).toBe("Daytona preview planned.");
    expect(preview.cloudArtifacts?.length).toBeGreaterThan(0);
  });

  it("builds failed health results when a cloud runtime command is unavailable", () => {
    const settings = makeSettings();
    const cloudState = createStore();
    const cloud = buildCloudProfile("modal", settings, "/workspace/root");

    const health = buildUnavailableCloudHealth({
      backend: "modal",
      cloudState,
      cloud,
      workspaceDir: "/workspace/root",
      binary: "modal",
      summary: "Modal CLI modal is not available for doolittle-workspace.",
      detail: "modal command is not available.",
      limits: buildHealthLimits(settings),
      diagnostics: ["modal is missing"],
      checks: [],
      bootstrap: ["install modal"],
    });

    expect(health.ready).toBe(false);
    expect(health.detail).toBe("modal command is not available.");
    expect(health.cloudSession?.state).toBe("failed");
    expect(health.cloudSnapshot?.event).toBe("health");
    expect(health.cloudSnapshot?.lastStderr).toBe(
      "modal command is not available.",
    );
  });

  it("records completed run metadata back into the cloud store", () => {
    const settings = makeSettings();
    const cloudState = createStore();
    const cloud = buildCloudProfile("modal", settings, "/workspace/root");

    const { cloudSession, cloudSnapshot } = recordCloudRunLifecycle({
      cloudState,
      cloud,
      command: "bun test",
      cwd: "/workspace/root",
      result: {
        exitCode: 17,
        stdout: "running",
        stderr: "failed",
        timedOut: false,
        durationMs: 25,
      },
      successSummary: "Modal command completed successfully.",
      failureSummary: "Modal command failed with exit code 17.",
    });

    expect(cloudSession.state).toBe("failed");
    expect(cloudSession.lastCommand).toBe("bun test");
    expect(cloudSession.lastExitCode).toBe(17);
    expect(cloudSnapshot.event).toBe("run");
    expect(cloudSnapshot.summary).toBe(
      "Modal command failed with exit code 17.",
    );
    expect(cloudState.get(cloud)?.snapshotCount).toBe(1);
  });
});
