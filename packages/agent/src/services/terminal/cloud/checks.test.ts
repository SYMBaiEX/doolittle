import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import {
  buildCloudRuntimeChecks,
  buildCloudRuntimePreviewChecks,
} from "../cloud/planning/checks";

function makeSettings(
  overrides?: Partial<RuntimeSettings["execution"]>,
): RuntimeSettings {
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
      remoteSyncExclude: [".git"],
      remoteArtifactPaths: [".doolittle/remote-artifacts"],
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
      modalCommand: "modal",
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
      ...overrides,
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

function tempWorkspacePath(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  return dir;
}

describe("terminal cloud runtime checks", () => {
  it("builds daytona checks with explicit runtime and workspace state", () => {
    const workspaceDir = tempWorkspacePath("doolittle-daytona-checks");
    const settings = makeSettings({
      backend: "daytona",
      daytonaCommand: "daytona",
      daytonaTarget: "sandbox-daytona",
      daytonaShell: "/bin/zsh",
      daytonaWorkspacePath: "/remote/daytona",
      daytonaSnapshot: "snapshot-77",
      daytonaBootstrapCommand: "echo ready",
      daytonaStatusCommand: "daytona info sandbox-daytona",
      daytonaInspectCommand: "daytona inspect sandbox-daytona",
      remoteArtifactPaths: [
        ".doolittle/remote-artifacts",
        ".doolittle/trajectories",
      ],
      remoteArtifactPolicy: "metadata-only",
      remoteSyncMode: "mirror",
      remoteSyncInclude: ["packages/agent/src/**"],
      remoteSyncExclude: [".git"],
      remoteWorkspaceLabel: "doolittle-daytona",
    });
    const checks = buildCloudRuntimeChecks(
      "daytona",
      settings,
      workspaceDir,
      true,
      true,
    );
    const byId = new Map(checks.map((check) => [check.id, check]));

    try {
      expect(byId.get("daytona.runtime.binary")?.status).toBe("pass");
      expect(byId.get("daytona.config.target")?.status).toBe("pass");
      expect(byId.get("daytona.config.workspace")?.status).toBe("pass");
      expect(byId.get("daytona.config.shell")?.status).toBe("pass");
      expect(byId.get("daytona.config.bootstrap")?.status).toBe("pass");
      expect(byId.get("daytona.config.status")?.status).toBe("pass");
      expect(byId.get("daytona.config.inspect")?.status).toBe("pass");
      expect(byId.get("daytona.config.environment")?.status).toBe("pass");
      expect(byId.get("daytona.config.sync.plan")?.detail).toContain("Mode=");
      expect(byId.get("daytona.config.artifacts")?.status).toBe("pass");
      expect(byId.get("daytona.workspace.cwd")?.status).toBe("pass");
      expect(byId.get("daytona.runtime.probe")?.status).toBe("pass");
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("highlights config warnings and probe failures in modal preview mode", () => {
    const workspaceDir = join(tmpdir(), "missing-doo-runtime-checks");
    if (existsSync(workspaceDir)) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
    const settings = makeSettings({
      backend: "modal",
      modalCommand: "modal",
      modalWorkspacePath: "/remote/modal",
      modalShell: "/bin/bash",
      modalBootstrapCommand: "",
      modalStatusCommand: "",
      modalInspectCommand: "",
      modalEnvironment: "",
      daytonaTarget: "",
      remoteArtifactPaths: [],
      remoteArtifactPolicy: "metadata-only",
      remoteSyncMode: "mirror",
      remoteSyncInclude: [],
      remoteSyncExclude: [],
      remoteWorkspaceLabel: "",
    });
    const checks = buildCloudRuntimeChecks(
      "modal",
      settings,
      workspaceDir,
      false,
      false,
    );
    const byId = new Map(checks.map((check) => [check.id, check]));

    expect(byId.get("modal.runtime.binary")?.status).toBe("fail");
    expect(byId.get("modal.config.target")?.status).toBe("fail");
    expect(byId.get("modal.config.environment")?.status).toBe("warn");
    expect(byId.get("modal.config.bootstrap")?.status).toBe("warn");
    expect(byId.get("modal.config.status")?.status).toBe("warn");
    expect(byId.get("modal.runtime.probe")?.status).toBe("fail");
    expect(byId.get("modal.workspace.cwd")?.status).toBe("warn");
  });

  it("builds preview checks with provider profile and mount status", () => {
    const workspaceDir = mkdtempSync(
      join(tmpdir(), "doolittle-cloud-preview-"),
    );
    const settings = makeSettings({
      backend: "daytona",
      daytonaTarget: "sandbox-preview",
      daytonaWorkspacePath: "/remote/preview",
      daytonaShell: "/bin/bash",
      daytonaBootstrapCommand: "echo booted",
      daytonaInspectCommand: "daytona inspect sandbox-preview",
      daytonaSnapshot: "snapshot-preview",
      remoteArtifactPaths: [".doolittle/remote-artifacts"],
      remoteArtifactPolicy: "metadata-only",
      remoteSyncMode: "snapshot",
      remoteSyncInclude: ["**/*"],
      remoteSyncExclude: ["node_modules"],
      remoteWorkspaceLabel: "preview-label",
    });

    const checks = buildCloudRuntimePreviewChecks(
      "daytona",
      settings,
      workspaceDir,
    );
    const byId = new Map(checks.map((check) => [check.id, check]));

    try {
      expect(byId.get("daytona.preview.generated")?.status).toBe("pass");
      expect(byId.get("daytona.preview.workspace.path")?.status).toBe("pass");
      expect(byId.get("daytona.preview.bootstrap")?.status).toBe("pass");
      expect(byId.get("daytona.preview.inspect")?.status).toBe("pass");
      expect(byId.get("daytona.preview.workspace.mount")?.status).toBe("pass");
      expect(byId.get("daytona.preview.artifacts")?.detail).toContain(
        "Artifact policy",
      );
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
