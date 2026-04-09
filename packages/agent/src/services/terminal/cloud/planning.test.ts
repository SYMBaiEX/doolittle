import { describe, expect, it } from "bun:test";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import {
  buildCloudProfile,
  buildCloudRuntimeChecks,
  buildCloudRuntimePreviewChecks,
  buildDaytonaExecArgs,
  buildModalShellArgs,
  buildRemoteSyncPlan,
  isValidEnvName,
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
      remoteSyncInclude: ["packages/agent/src/**"],
      remoteSyncExclude: [],
      remoteArtifactPaths: [],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "",
      dockerImage: "oven/bun:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: ["PATH", "HOME", "1INVALID"],
      singularityImage: "",
      daytonaTarget: "sandbox-dev",
      daytonaCommand: "daytona",
      daytonaShell: "/bin/sh",
      daytonaWorkspacePath: "/remote/daytona",
      daytonaSnapshot: "snapshot-dev",
      daytonaBootstrapCommand: "",
      daytonaStatusCommand: "",
      daytonaInspectCommand: "",
      modalTarget: "sandbox-prod",
      modalCommand: "modal",
      modalShell: "/bin/bash",
      modalWorkspacePath: "/remote/modal",
      modalEnvironment: "prod",
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

describe("terminal cloud planning namespace", () => {
  it("keeps env validation and sync defaults stable", () => {
    expect(isValidEnvName("PATH")).toBe(true);
    expect(isValidEnvName("1INVALID")).toBe(false);

    const plan = buildRemoteSyncPlan(
      "daytona",
      makeSettings(),
      "/tmp/workspace",
      "/remote/daytona",
    );
    expect(plan.include).toEqual(["packages/agent/src/**"]);
    expect(plan.exclude).toContain(".git");
    expect(plan.workspaceLabel).toContain("sandbox-dev");
  });

  it("builds daytona and modal planning checks from the shared seam", () => {
    const settings = makeSettings();
    const daytonaProfile = buildCloudProfile("daytona", settings, "/tmp");
    const modalProfile = buildCloudProfile("modal", settings, "/tmp");
    expect(daytonaProfile.provider).toBe("daytona");
    expect(modalProfile.provider).toBe("modal");
    expect(daytonaProfile.syncPlan.mode).toBe("snapshot");
    expect(modalProfile.environment).toBe("prod");

    const runtimeChecks = buildCloudRuntimeChecks(
      "daytona",
      settings,
      "/tmp",
      true,
      true,
    );
    expect(
      runtimeChecks.some((check) => check.id === "daytona.config.target"),
    ).toBe(true);

    const previewChecks = buildCloudRuntimePreviewChecks(
      "modal",
      settings,
      "/tmp",
    );
    expect(
      previewChecks.some((check) => check.id === "modal.preview.inspect"),
    ).toBe(true);
  });

  it("builds daytona and modal command args", () => {
    const settings = makeSettings();
    const daytonaArgs = buildDaytonaExecArgs(
      settings,
      "printf ok",
      "/tmp/workspace",
      2_000,
    );
    const modalArgs = buildModalShellArgs(
      settings,
      "printf ok",
      "/tmp/workspace",
    );
    expect(daytonaArgs[0]).toBe("daytona");
    expect(modalArgs[0]).toBe("modal");
    expect(daytonaArgs.join(" ")).toContain("--timeout 2");
    expect(modalArgs.join(" ")).toContain("-e prod");
  });
});
