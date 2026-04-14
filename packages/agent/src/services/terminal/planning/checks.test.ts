import { describe, expect, it } from "bun:test";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import {
  buildContainerChecks,
  buildContainerPreviewChecks,
  buildSingularityChecks,
  buildSshChecks,
  buildSshPreviewChecks,
} from "./checks";

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
      remoteSyncInclude: ["**/*"],
      remoteSyncExclude: [".git"],
      remoteArtifactPaths: [".doolittle/remote-artifacts"],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "doolittle-workspace",
      dockerImage: "oven/bun:latest",
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

describe("planning checks", () => {
  it("flags invalid container env passthrough names", () => {
    const settings = makeSettings();
    settings.execution.dockerEnvPassthrough = ["PATH", "NOT-A-REAL-ENV"];

    const checks = buildContainerChecks(
      "docker",
      settings,
      process.cwd(),
      true,
      true,
    );

    expect(
      checks.find((check) => check.id === "docker.sandbox.env")?.status,
    ).toBe("warn");
    expect(
      checks.find((check) => check.id === "docker.sandbox.env")?.detail,
    ).toContain("NOT-A-REAL-ENV");
    expect(
      buildContainerPreviewChecks("docker", settings, process.cwd()).find(
        (check) => check.id === "docker.preview.workspace",
      )?.status,
    ).toBe("pass");
  });

  it("marks writable preview rootfs as warn for container planning", () => {
    const settings = makeSettings();
    settings.execution.containerReadOnlyRoot = false;

    const checks = buildContainerPreviewChecks(
      "podman",
      settings,
      process.cwd(),
    );

    expect(
      checks.find((check) => check.id === "podman.preview.rootfs")?.status,
    ).toBe("warn");
    expect(
      checks.find((check) => check.id === "podman.preview.rootfs")?.detail,
    ).toContain("writable");
  });

  it("summarizes ssh runtime and preview readiness", () => {
    const settings = makeSettings();
    settings.execution.sshHost = "example.com";
    settings.execution.sshUser = "doolittle";
    settings.execution.sshPath = "/srv/workspace";
    settings.execution.sshKeyPath = "/tmp/does-not-exist";

    const runtimeChecks = buildSshChecks(settings, true, false);
    const previewChecks = buildSshPreviewChecks(settings);

    expect(
      runtimeChecks.find((check) => check.id === "ssh.config.key")?.status,
    ).toBe("fail");
    expect(
      runtimeChecks.find((check) => check.id === "ssh.runtime.probe")?.status,
    ).toBe("fail");
    expect(
      previewChecks.find((check) => check.id === "ssh.preview.path")?.status,
    ).toBe("pass");
  });

  it("reports singularity image configuration gaps", () => {
    const settings = makeSettings();

    const checks = buildSingularityChecks(settings, process.cwd(), true, false);

    expect(
      checks.find((check) => check.id === "singularity.config.image")?.status,
    ).toBe("fail");
    expect(
      checks.find((check) => check.id === "singularity.workspace.mount")
        ?.status,
    ).toBe("pass");
  });
});
