import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DiagnosticCheck } from "@/types";
import type { TerminalRunResult } from "../execution/subprocess";
import { sanitizeCommand } from "../execution/subprocess/commands";
import { LOCAL_SHELL, shellQuote } from "../execution/subprocess/shell";
import { buildSshBaseArgs } from "../planning";
import { makeSettings } from "./testing";

const commandExistsCalls: Array<{ binary: string; timeoutMs: number }> = [];
const runCommandCalls: Array<{ cmd: string[]; timeoutMs: number }> = [];
let commandExistsResult = true;
let runCommandResults: TerminalRunResult[] = [];

function getCheckStatus(
  checks: DiagnosticCheck[],
  id: string,
): DiagnosticCheck["status"] | undefined {
  return checks.find((check) => check.id === id)?.status;
}

function installSshBackendMocks() {
  mock.module("../execution/subprocess", () => ({
    LOCAL_SHELL,
    commandExists: async (binary: string, timeoutMs: number) => {
      commandExistsCalls.push({ binary, timeoutMs });
      return commandExistsResult;
    },
    normalizeBackendError: (result: TerminalRunResult) => result,
    runCommand: async (cmd: string[], options: { timeoutMs: number }) => {
      runCommandCalls.push({ cmd, timeoutMs: options.timeoutMs });
      return (
        runCommandResults.shift() ?? {
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
          durationMs: 1,
        }
      );
    },
    sanitizeCommand,
    shellQuote,
    createMissingCloudTargetRunResult: undefined,
    readCloudInfoSummary: undefined,
  }));
}

async function loadBackend() {
  return import(`./ssh?ssh-test=${Date.now()}-${Math.random()}`);
}

describe("ssh execution backend", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
    commandExistsCalls.length = 0;
    runCommandCalls.length = 0;
    commandExistsResult = true;
    runCommandResults = [];
    installSshBackendMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("returns validation errors when required config is missing", async () => {
    const { createSshExecutionBackend } = await loadBackend();
    const backend = createSshExecutionBackend();

    const result = await backend.run("printf ok", {
      timeoutMs: 10_000,
      settings: makeSettings({
        backend: "ssh",
        sshHost: "",
        sshUser: "",
        sshPath: "",
      }),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("SSH backend requires");
    expect(runCommandCalls).toEqual([]);
  });

  it("builds preview plans with remote path and shell wrapping", async () => {
    const { createSshExecutionBackend } = await loadBackend();
    const backend = createSshExecutionBackend();
    const settings = makeSettings({
      backend: "ssh",
      sshHost: "example.com",
      sshUser: "ubuntu",
      sshPath: "/workspace",
      sshPort: 22,
      sshKeyPath: "",
      sshStrictHostKeyChecking: true,
    });

    const preview = backend.preview("printf hi", {
      cwd: "/local/repo",
      timeoutMs: 15_000,
      settings,
    });

    expect(preview.engine).toBe("ssh");
    expect(preview.backend).toBe("ssh");
    expect(preview.command).toBe("printf hi");
    expect(preview.argv[0]).toBe("ssh");
    const sshBaseArgs = buildSshBaseArgs(settings);
    for (const arg of sshBaseArgs) {
      expect(preview.argv).toContain(arg);
    }
    expect(preview.argv).toContain(
      `${settings.execution.sshUser}@${settings.execution.sshHost}`,
    );
    expect(preview.argv.at(-1)).toContain("cd '/workspace'");
    expect(getCheckStatus(preview.checks, "ssh.preview.path")).toBe("pass");
  });

  it("reports unhealthy state when runtime is unavailable", async () => {
    commandExistsResult = false;
    const { createSshExecutionBackend } = await loadBackend();
    const backend = createSshExecutionBackend();
    const settings = makeSettings({
      backend: "ssh",
      sshHost: "example.com",
      sshUser: "ubuntu",
      sshPath: "/workspace",
    });

    const health = await backend.health(settings);

    expect(health.ready).toBe(false);
    expect(health.detail).toBe("SSH command not available.");
    expect(commandExistsCalls).toEqual([{ binary: "ssh", timeoutMs: 5_000 }]);
    expect(getCheckStatus(health.checks, "ssh.runtime.binary")).toBe("fail");
  });

  it("returns explicit key-path failures before probing remote workspace", async () => {
    const missingKey = join(
      mkdtempSync("/tmp/doolittle-ssh-key-"),
      "missing.pem",
    );
    const { createSshExecutionBackend } = await loadBackend();
    const backend = createSshExecutionBackend();
    const settings = makeSettings({
      backend: "ssh",
      sshHost: "example.com",
      sshUser: "ubuntu",
      sshPath: "/workspace",
      sshKeyPath: missingKey,
      sshStrictHostKeyChecking: false,
    });

    const health = await backend.health(settings);

    expect(health.ready).toBe(false);
    expect(health.detail).toContain("key path does not exist");
    expect(runCommandCalls).toEqual([]);
    rmSync(missingKey, { recursive: true, force: true });
  });

  it("runs remote probe and marks ready on success", async () => {
    const root = mkdtempSync("/tmp/doolittle-ssh-key-");
    const keyPath = join(root, "id_rsa");
    writeFileSync(keyPath, "secret");
    runCommandResults = [
      {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        timedOut: false,
        durationMs: 10,
      },
    ];

    const { createSshExecutionBackend } = await loadBackend();
    const backend = createSshExecutionBackend();
    const settings = makeSettings({
      backend: "ssh",
      sshHost: "example.com",
      sshUser: "ubuntu",
      sshPath: "/workspace",
      sshKeyPath: keyPath,
      sshStrictHostKeyChecking: false,
    });
    const health = await backend.health(settings);

    try {
      expect(health.ready).toBe(true);
      expect(health.detail).toContain("SSH backend ready");
      expect(getCheckStatus(health.checks, "ssh.runtime.probe")).toBe("pass");
      expect(runCommandCalls).toEqual([
        {
          cmd: [
            "ssh",
            ...buildSshBaseArgs(settings),
            "ubuntu@example.com",
            "test",
            "-d",
            "/workspace",
          ],
          timeoutMs: 5_000,
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("forwards command execution through run command transport", async () => {
    const settings = makeSettings({
      backend: "ssh",
      sshHost: "example.com",
      sshUser: "ubuntu",
      sshPath: "/workspace",
      sshStrictHostKeyChecking: false,
    });
    runCommandResults = [
      {
        exitCode: 42,
        stdout: "",
        stderr: "failure",
        timedOut: false,
        durationMs: 3,
      },
    ];
    const { createSshExecutionBackend } = await loadBackend();
    const backend = createSshExecutionBackend();
    const result = await backend.run("printf fail", {
      timeoutMs: 9_999,
      settings,
    });

    expect(result.exitCode).toBe(42);
    expect(result.stderr).toBe("failure");
    expect(runCommandCalls).toHaveLength(1);
    expect(runCommandCalls[0].timeoutMs).toBe(9_999);
    expect(runCommandCalls[0].cmd[0]).toBe("ssh");
    expect(runCommandCalls[0].cmd).toContain("ubuntu@example.com");
    expect(runCommandCalls[0].cmd.at(-1)).toContain(
      "cd '/workspace' && exec sh -lc",
    );
    expect(runCommandCalls[0].cmd.at(-1)).toContain("printf fail");
  });
});
