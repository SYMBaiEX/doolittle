import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { TerminalRunResult } from "../execution/subprocess";
import { sanitizeCommand } from "../execution/subprocess/commands";
import { runCommandStreaming } from "../execution/subprocess/run";
import { LOCAL_SHELL, shellQuote } from "../execution/subprocess/shell";
import { makeSettings } from "./testing";

const commandExistsCalls: Array<{ binary: string; timeoutMs: number }> = [];
const runCommandCalls: Array<{ cmd: string[]; timeoutMs: number }> = [];
let commandExistsResult = true;
let runCommandResults: TerminalRunResult[] = [];

function installContainerHealthMocks() {
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
    runCommandStreaming,
    sanitizeCommand,
    shellQuote,
  }));
}

async function loadCreateContainerExecutionBackends() {
  return import(
    `./container?container-health-test=${Date.now()}-${Math.random()}`
  );
}

async function getBackend(name: "docker" | "podman") {
  const { createContainerExecutionBackends } =
    await loadCreateContainerExecutionBackends();
  const backend = createContainerExecutionBackends().find(
    (candidate: { name: string }) => candidate.name === name,
  );
  if (!backend) {
    throw new Error(`missing ${name} backend`);
  }
  return backend;
}

describe("container execution backend health", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
    commandExistsCalls.length = 0;
    runCommandCalls.length = 0;
    commandExistsResult = true;
    runCommandResults = [];
    installContainerHealthMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("reports a missing runtime before attempting version or image probes", async () => {
    commandExistsResult = false;

    const health = await (await getBackend("docker")).health(
      makeSettings({ backend: "docker", dockerEnvPassthrough: [] }),
      "/workspace/project",
    );

    expect(health.ready).toBe(false);
    expect(health.detail).toBe("Docker command not available.");
    expect(commandExistsCalls).toEqual([
      { binary: "docker", timeoutMs: 5_000 },
    ]);
    expect(runCommandCalls).toEqual([]);
  });

  it("uses engine-specific probes and reports readiness when the image exists", async () => {
    runCommandResults = [
      {
        exitCode: 0,
        stdout: "5.0.0",
        stderr: "",
        timedOut: false,
        durationMs: 2,
      },
      {
        exitCode: 0,
        stdout: "image-ok",
        stderr: "",
        timedOut: false,
        durationMs: 1,
      },
    ];

    const health = await (await getBackend("podman")).health(
      makeSettings({ backend: "docker", dockerEnvPassthrough: [] }),
      "/workspace/project",
    );

    expect(health.ready).toBe(true);
    expect(health.engine).toBe("podman");
    expect(health.detail).toContain("Podman ready (5.0.0)");
    expect(runCommandCalls).toEqual([
      { cmd: ["podman", "--version"], timeoutMs: 5_000 },
      {
        cmd: ["podman", "image", "inspect", "oven/bun:latest"],
        timeoutMs: 5_000,
      },
    ]);
  });
});
