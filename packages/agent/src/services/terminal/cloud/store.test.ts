import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import { buildCloudProfile } from "../planning";
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
      backend: "daytona",
      remoteSyncMode: "mirror",
      remoteSyncInclude: ["packages/agent/src/**"],
      remoteSyncExclude: [".git", ".doolittle", "node_modules"],
      remoteArtifactPaths: [".doolittle/remote-artifacts"],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "doolittle-workspace",
      dockerImage: "oven/bun:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: ["PATH"],
      singularityImage: "",
      daytonaTarget: "sandbox-dev",
      daytonaCommand: "daytona",
      daytonaShell: "/bin/bash",
      daytonaWorkspacePath: "/workspace",
      daytonaSnapshot: "snapshot-dev",
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

describe("cloud store", () => {
  it("touches, captures, and persists cloud sessions and snapshots", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-terminal-cloud-"));
    const store = new CloudStoreManager(join(root, "cloud-sessions.json"));
    const settings = makeSettings();
    const profile = buildCloudProfile("daytona", settings, root);

    try {
      const touched = store.touch(profile, { state: "running" });
      expect(touched.state).toBe("running");
      expect(touched.workspaceLabel).toBe("doolittle-workspace");

      const snapshot = store.capture(profile, {
        event: "run",
        state: "ready",
        cwd: root,
        summary: "capture recorded",
        commandId: "command-1",
        command: "printf ok",
        lastExitCode: 0,
        lastStdout: "ok",
        lastStderr: "",
      });

      expect(snapshot.provider).toBe("daytona");
      expect(snapshot.artifacts).toHaveLength(1);
      expect(store.listSnapshots()).toHaveLength(1);
      expect(store.listArtifacts()).toHaveLength(1);

      const persisted = JSON.parse(
        readFileSync(join(root, "cloud-sessions.json"), "utf8"),
      ) as {
        sessions?: Array<{
          provider?: string;
          target?: string;
          state?: string;
          snapshotCount?: number;
          artifactCount?: number;
          lastSnapshotSummary?: string;
        }>;
        snapshots?: Array<{ summary?: string }>;
      };

      expect(persisted.sessions?.[0]).toMatchObject({
        provider: "daytona",
        target: "sandbox-dev",
        state: "ready",
        snapshotCount: 1,
        artifactCount: 1,
        lastSnapshotSummary: "capture recorded",
      });
      expect(persisted.snapshots?.[0]?.summary).toBe("capture recorded");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
