import { describe, expect, it } from "bun:test";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import { buildCloudCommandScript } from "./shared";

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
      remoteSyncInclude: [],
      remoteSyncExclude: [],
      remoteArtifactPaths: [],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "",
      dockerImage: "oven/bun:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: ["PATH", "HOME", "1INVALID"],
      singularityImage: "",
      daytonaTarget: "",
      daytonaCommand: "",
      daytonaShell: "",
      daytonaWorkspacePath: "",
      daytonaSnapshot: "",
      daytonaBootstrapCommand: "",
      daytonaStatusCommand: "",
      daytonaInspectCommand: "",
      modalTarget: "",
      modalCommand: "",
      modalShell: "",
      modalWorkspacePath: "",
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

describe("cloud command script builder", () => {
  it("exports validated env vars before the user command", () => {
    const settings = makeSettings();
    const originalPath = process.env.PATH;
    const originalHome = process.env.HOME;

    process.env.PATH = "/usr/bin:/bin";
    process.env.HOME = "/Users/test user";

    try {
      const script = buildCloudCommandScript(
        "printf ok",
        "/tmp/workspace",
        settings,
        {
          bootstrapCommand: "source /tmp/bootstrap.sh",
        },
      );

      expect(script).toContain("set -eu && cd '/tmp/workspace'");
      expect(script).toContain("export PATH=");
      expect(script).toContain("HOME=");
      expect(script).not.toContain("1INVALID");
      expect(script.endsWith("source /tmp/bootstrap.sh && printf ok")).toBe(
        true,
      );
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });
});
