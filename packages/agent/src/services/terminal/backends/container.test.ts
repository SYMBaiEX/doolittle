import { describe, expect, it } from "bun:test";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import { createContainerExecutionBackends } from "./container";

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
      backend: "docker",
      remoteSyncMode: "mirror",
      remoteSyncInclude: ["packages/agent/src/**"],
      remoteSyncExclude: [".git", ".doolittle"],
      remoteArtifactPaths: [".doolittle/remote-artifacts"],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "doolittle-workspace",
      dockerImage: "oven/bun:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: [],
      singularityImage: "",
      daytonaTarget: "",
      daytonaCommand: "daytona",
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

describe("container execution backends", () => {
  it("creates docker and podman execution backends with existing preview behavior", () => {
    const byName = new Map(
      createContainerExecutionBackends().map((backend) => [
        backend.name,
        backend,
      ]),
    );

    const docker = byName.get("docker");
    const podman = byName.get("podman");
    if (!docker || !podman) {
      throw new Error("expected docker and podman backends");
    }

    const dockerPreview = docker.preview("printf ok", {
      cwd: process.cwd(),
      timeoutMs: 5_000,
      settings: makeSettings(),
    });
    const podmanPreview = podman.preview("printf ok", {
      cwd: process.cwd(),
      timeoutMs: 5_000,
      settings: makeSettings(),
    });

    expect(dockerPreview.engine).toBe("docker");
    expect(dockerPreview.argv[0]).toBe("docker");
    expect(podmanPreview.engine).toBe("podman");
    expect(podmanPreview.argv[0]).toBe("podman");
  });
});
