import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TerminalService } from "./terminal-service";
import type { RuntimeSettings } from "./settings-service";

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
      dockerImage: "oven/bun:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: ["PATH", "HOME"],
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
  };
}

describe("TerminalService", () => {
  it("runs local commands and records them", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-terminal-test-"));
    const service = new TerminalService(join(root, "data"), root, makeSettings);

    try {
      const result = await service.run("printf 'terminal-ok'");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("terminal-ok");
      expect(service.recent(1)[0]?.command).toBe("printf 'terminal-ok'");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports command timeouts cleanly", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-terminal-timeout-"));
    const service = new TerminalService(join(root, "data"), root, makeSettings);

    try {
      const result = await service.run("sleep 1", 25);
      expect(result.exitCode).toBe(124);
      expect(result.stderr).toContain("timed out");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports local backend health", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-terminal-health-"));
    const service = new TerminalService(join(root, "data"), root, makeSettings);

    try {
      const health = await service.health();
      const local = health.find((entry) => entry.backend === "local");
      expect(local?.ready).toBe(true);
      expect(local?.limits.commandTimeoutMs).toBe(30_000);
      expect(local?.limits.containerReadOnlyRoot).toBe(true);
      expect(health.some((entry) => entry.backend === "podman")).toBe(true);
      expect(health.find((entry) => entry.backend === "docker")?.mode).toBe("container");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
