import { describe, expect, it } from "bun:test";
import type {
  ExecutionBackendPreview,
  ExecutionCloudSession,
  ExecutionCloudSnapshotRecord,
  TerminalCommandRecord,
} from "@/types/execution";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import {
  appendCommandRecord,
  buildTerminalCommandRecord,
} from "../records/command";
import {
  buildCloudProfile,
  buildContainerCommand,
  buildDaytonaExecArgs,
  buildModalShellArgs,
} from "./index";

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
      remoteArtifactPaths: [
        ".doolittle/remote-artifacts",
        ".doolittle/trajectories",
      ],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "doolittle-workspace",
      dockerImage: "oven/bun:latest",
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

describe("planning helpers", () => {
  it("builds cloud profiles and remote command args", () => {
    const settings = makeSettings();
    settings.execution.backend = "daytona";
    settings.execution.daytonaTarget = "sandbox-dev";
    settings.execution.daytonaCommand = "daytona";
    settings.execution.daytonaShell = "/bin/bash";
    settings.execution.daytonaWorkspacePath = "/remote/daytona";
    settings.execution.daytonaSnapshot = "snapshot-dev";
    settings.execution.daytonaBootstrapCommand = "mkdir -p .doolittle";
    settings.execution.daytonaStatusCommand =
      "daytona info sandbox-dev --format json";
    process.env.TERMINAL_SERVICE_HELPER_TOKEN = "value with spaces";
    settings.execution.dockerEnvPassthrough = ["TERMINAL_SERVICE_HELPER_TOKEN"];

    try {
      const cloud = buildCloudProfile("daytona", settings, "/repo");
      expect(cloud.workspacePath).toBe("/remote/daytona");
      expect(cloud.syncPlan.mode).toBe("snapshot");
      expect(cloud.inspectCommand).toContain("daytona info sandbox-dev");

      const daytonaArgs = buildDaytonaExecArgs(
        settings,
        "printf 'hello'",
        "/repo",
        4500,
      );
      expect(daytonaArgs[0]).toBe("daytona");
      expect(daytonaArgs).toContain("--timeout");
      expect(daytonaArgs).toContain("5");
      expect(daytonaArgs.at(-1)).toContain("mkdir -p .doolittle");
      expect(daytonaArgs.at(-1)).toContain(
        "export TERMINAL_SERVICE_HELPER_TOKEN='value with spaces'",
      );
    } finally {
      delete process.env.TERMINAL_SERVICE_HELPER_TOKEN;
    }

    settings.execution.backend = "modal";
    settings.execution.modalTarget = "sandbox-prod";
    settings.execution.modalCommand = "modal";
    settings.execution.modalShell = "/bin/zsh";
    settings.execution.modalWorkspacePath = "/remote/modal";
    settings.execution.modalEnvironment = "sandbox-prod-env";
    settings.execution.modalBootstrapCommand = "mkdir -p .doolittle";

    const modalArgs = buildModalShellArgs(settings, "pwd", "/repo");
    expect(modalArgs[0]).toBe("modal");
    expect(modalArgs).toContain("-e");
    expect(modalArgs).toContain("sandbox-prod-env");
    expect(modalArgs.at(-1)).toContain("/bin/zsh -lc");
    expect(modalArgs.at(-1)).toContain("mkdir -p .doolittle");
  });

  it("builds hardened container commands with env passthrough", () => {
    const settings = makeSettings();
    settings.execution.backend = "docker";
    settings.execution.dockerEnvPassthrough = [
      "TERMINAL_SERVICE_HELPER_TOKEN",
      "NOT-A-REAL-ENV",
    ];
    process.env.TERMINAL_SERVICE_HELPER_TOKEN = "ok";

    try {
      const argv = buildContainerCommand(
        "docker",
        "printf ok",
        "/workspace",
        settings,
      );
      expect(argv[0]).toBe("docker");
      expect(argv).toContain("--security-opt");
      expect(argv).toContain("no-new-privileges");
      expect(argv).toContain("--read-only");
      expect(argv).toContain("-e");
      expect(argv).toContain("TERMINAL_SERVICE_HELPER_TOKEN=ok");
      expect(argv.at(-1)).toBe("printf ok");
      expect(argv).not.toContain("NOT-A-REAL-ENV");
    } finally {
      delete process.env.TERMINAL_SERVICE_HELPER_TOKEN;
    }
  });

  it("assembles command records and trims history", () => {
    const settings = makeSettings();
    settings.execution.backend = "daytona";
    settings.execution.daytonaTarget = "sandbox-dev";
    const cloud = buildCloudProfile("daytona", settings, "/repo");
    const cloudSession = {
      sessionId: "session-preview",
      provider: "daytona",
      target: "sandbox-dev",
      profile: cloud,
      state: "ready",
      syncState: "synced",
      workspaceLabel: cloud.workspaceLabel,
      createdAt: "2026-03-29T00:00:00.000Z",
      updatedAt: "2026-03-29T00:00:00.000Z",
      snapshotCount: 1,
      artifactCount: 1,
      syncPlan: cloud.syncPlan,
    } as ExecutionCloudSession;
    const cloudSnapshot = {
      snapshotId: "snapshot-preview",
      provider: "daytona",
      target: "sandbox-dev",
      workspaceLabel: cloud.workspaceLabel,
      event: "preview",
      state: "planned",
      summary: "preview",
      cwd: "/repo",
      workspacePath: cloud.workspacePath,
      syncPlan: cloud.syncPlan,
      artifacts: [
        {
          artifactId: "artifact-preview",
          provider: "daytona",
          target: "sandbox-dev",
          workspaceLabel: cloud.workspaceLabel,
          path: ".doolittle/remote-artifacts",
          kind: "manifest",
          status: "planned",
          detail: "artifact",
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-29T00:00:00.000Z",
        },
      ],
      createdAt: "2026-03-29T00:00:00.000Z",
      updatedAt: "2026-03-29T00:00:00.000Z",
    } as ExecutionCloudSnapshotRecord;
    const preview = {
      backend: "daytona",
      mode: "remote",
      engine: "daytona",
      target: "sandbox-dev",
      cloud,
      cloudSession,
      cloudSnapshot,
      cloudArtifacts: cloudSnapshot.artifacts,
      cloudSyncPlan: cloud.syncPlan,
      ready: true,
      detail: "ready",
      cwd: "/repo",
      timeoutMs: 30_000,
      command: "git status",
      argv: ["daytona"],
      diagnostics: [],
      checks: [],
      bootstrap: [],
    } as ExecutionBackendPreview;

    const record = buildTerminalCommandRecord({
      command: "git status",
      backend: "daytona",
      preview,
      result: {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        timedOut: false,
        durationMs: 12,
      },
      cwd: "/repo",
      timeoutMs: 30_000,
      startedAt: "2026-03-29T00:00:00.000Z",
      completedAt: "2026-03-29T00:00:01.000Z",
      latestCloudSession: {
        ...cloudSession,
        sessionId: "session-latest",
      } as ExecutionCloudSession,
      latestCloudSnapshot: {
        ...cloudSnapshot,
        snapshotId: "snapshot-latest",
        artifacts: [
          {
            ...cloudSnapshot.artifacts[0],
            artifactId: "artifact-latest",
          },
        ],
      } as ExecutionCloudSnapshotRecord,
    });

    expect(record.executionSessionId).toBe("session-latest");
    expect(record.cloudSnapshot?.snapshotId).toBe("snapshot-latest");
    expect(record.cloudArtifacts?.[0].artifactId).toBe("artifact-latest");

    const trimmed = appendCommandRecord(
      { commands: [record] },
      { ...record, id: "second" } as TerminalCommandRecord,
      1,
    );
    expect(trimmed.commands).toHaveLength(1);
    expect(trimmed.commands[0].id).toBe("second");
  });
});
