import { describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import { buildCloudProfile, buildContainerCommand } from "../planning";
import { runCommand, runCommandStreaming, sanitizeCommand } from "./subprocess";

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
      dockerEnvPassthrough: ["PATH", "HOME"],
      singularityImage: "",
      daytonaTarget: "sandbox-dev",
      daytonaCommand: "daytona",
      daytonaShell: "/bin/bash",
      daytonaWorkspacePath: "/workspace",
      daytonaSnapshot: "snapshot-dev",
      daytonaBootstrapCommand: "",
      daytonaStatusCommand: "",
      daytonaInspectCommand: "",
      modalTarget: "sandbox-prod",
      modalCommand: "modal",
      modalShell: "/bin/bash",
      modalWorkspacePath: "/workspace",
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

function writeExecutable(filePath: string, content: string): void {
  writeFileSync(filePath, content, "utf8");
  chmodSync(filePath, 0o755);
}

describe("execution subprocess helpers", () => {
  it("sanitizes commands and builds cloud/container helpers", () => {
    const settings = makeSettings();
    const profile = buildCloudProfile("daytona", settings, "/workspace/root");

    expect(sanitizeCommand("  printf ok  ")).toBe("printf ok");
    expect(profile.syncPlan.mode).toBe("snapshot");
    expect(profile.syncPlan.include).toEqual(["**/*"]);
    expect(profile.artifactPaths).toEqual([
      ".doolittle/remote-artifacts",
      ".doolittle/trajectories",
      ".doolittle/cron-output",
    ]);

    const argv = buildContainerCommand(
      "docker",
      "printf ok",
      "/workspace/root",
      settings,
    );
    expect(argv[0]).toBe("docker");
    expect(argv).toContain("--security-opt");
    expect(argv).toContain("no-new-privileges");
    expect(argv).toContain("--cap-drop");
    expect(argv).toContain("ALL");
    expect(argv.at(-1)).toBe("printf ok");
  });

  it("streams stdout and stderr chunks while preserving the final result", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-terminal-stream-"));
    const scriptPath = join(root, "stream.sh");
    writeExecutable(
      scriptPath,
      [
        "#!/bin/sh",
        "printf 'alpha'",
        "printf 'beta' >&2",
        "printf 'gamma'",
        "",
      ].join("\n"),
    );

    let stdout = "";
    let stderr = "";

    try {
      const result = await runCommandStreaming([scriptPath], {
        timeoutMs: 5_000,
        onStdout: (chunk) => {
          stdout += chunk;
        },
        onStderr: (chunk) => {
          stderr += chunk;
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("alphagamma");
      expect(result.stderr).toBe("beta");
      expect(stdout).toBe("alphagamma");
      expect(stderr).toBe("beta");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns process metadata for non-streamed runs", async () => {
    const result = await runCommand(["sh", "-c", "echo alpha"], {
      timeoutMs: 5_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
