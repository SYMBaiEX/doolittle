import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DOOLITTLE_SHELL_SERVICE,
  MAX_COMMAND_TIMEOUT_MS,
} from "@doolittle/contracts";
import { MAX_TERMINAL_CAPTURE_BYTES } from "@elizaos/agent/api/terminal-output-contract";
import { MAX_SHELL_STDIO_BYTES } from "@elizaos/agent/services/shell-stdio-budget";
import { expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { handleOperationsRoutes } from "../../packages/agent/src/server/routes/operations";
import type { RuntimeSettings } from "../../packages/agent/src/services/settings/runtime-settings";
import { TerminalServiceCommandOrchestrator } from "../../packages/agent/src/services/terminal/command/orchestrator";
import type { ExecutionBackend } from "../../packages/agent/src/services/terminal/contracts/backend";
import { TerminalCommandHistoryStore } from "../../packages/agent/src/services/terminal/records/history";

it("binds SDK run identities to command, timeout and workspace and replays their durable receipts", async () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-terminal-identity-"));
  try {
    const historyStore = new TerminalCommandHistoryStore(
      join(root, "history.json"),
    );
    let release = () => {};
    const gate = new Promise<void>((done) => {
      release = done;
    });
    let output = { stdout: "VERIFIED", stderr: "", exitCode: 0 };
    const run = vi.fn(async () => {
      await gate;
      return {
        ...output,
        timedOut: false,
        durationMs: 1,
      };
    });
    const backend: ExecutionBackend = {
      name: "local",
      capabilities: () => ({ ownedCancellation: true }),
      run,
      preview: (command, { cwd, timeoutMs }) => ({
        backend: "local",
        mode: "local",
        ready: true,
        detail: "fixture",
        command,
        argv: [command],
        cwd,
        timeoutMs,
        diagnostics: [],
        checks: [],
        bootstrap: [],
        limits: {},
      }),
      health: async () => {
        throw new Error("Not part of command execution");
      },
    };
    let workspace = root;
    const options = {
      getWorkspaceDir: () => workspace,
      getSettings: () =>
        ({
          execution: { backend: "local", commandTimeoutMs: 30000 },
        }) as RuntimeSettings,
      backends: new Map([["local" as const, backend]]),
      historyStore,
    };
    const terminal = new TerminalServiceCommandOrchestrator(options);
    const runId = `run-${randomUUID()}`;
    const first = terminal.run("verify", 1000, undefined, { runId });
    const duplicate = terminal.run("verify", 1000, undefined, { runId });
    expect(run).toHaveBeenCalledTimes(1);
    await expect(
      terminal.run("different", 1000, undefined, { runId }),
    ).rejects.toThrow("different request");
    await expect(
      terminal.run("verify", 2000, undefined, { runId }),
    ).rejects.toThrow("different request");
    workspace = join(root, "other");
    await expect(
      terminal.run("verify", 1000, undefined, { runId }),
    ).rejects.toThrow("different request");
    workspace = root;
    release();
    expect((await first).id).toBe(runId);
    expect(await duplicate).toEqual(await first);
    const reopened = new TerminalServiceCommandOrchestrator(options);
    expect(await reopened.run("verify", 1000, undefined, { runId })).toEqual(
      await first,
    );
    expect(run).toHaveBeenCalledTimes(1);
    expect(historyStore.read().commands[0]?.id).toBe(runId);
    vi.stubEnv("ELIZA_TERMINAL_RUN_TOKEN", "fixture-terminal-capability");
    vi.stubEnv("ELIZA_RUNTIME_MODE", "local-yolo");
    vi.stubEnv("ELIZA_TERMINAL_MAX_DURATION_MS", undefined);
    const context = {
      services: { terminal: { assertExecutionAvailable: () => undefined } },
      runtime: {
        getService: (type: string) =>
          type === DOOLITTLE_SHELL_SERVICE
            ? { run: reopened.run.bind(reopened) }
            : null,
      },
    } as unknown as AppContext;
    const url = new URL("http://127.0.0.1/api/terminal/run");
    const request = (timeoutMs: number, requestedRunId = runId) =>
      new Request(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-eliza-terminal-token": "fixture-terminal-capability",
          "x-eliza-terminal-run-id": requestedRunId,
        },
        body: JSON.stringify({
          command: "verify",
          timeoutMs,
          captureOutput: true,
        }),
      });
    const response = await handleOperationsRoutes(context, request(1000), url, {
      captureOutputRequired: true,
    });
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      runId,
      stdout: "VERIFIED",
      exitCode: 0,
      truncated: false,
      maxDurationMs: 1000,
    });
    const invalid = await handleOperationsRoutes(
      context,
      request(MAX_COMMAND_TIMEOUT_MS + 1),
      url,
      { captureOutputRequired: true },
    );
    expect(invalid?.status).toBe(400);
    expect(run).toHaveBeenCalledTimes(1);

    for (const { status, ...capture } of [
      {
        status: 413,
        stdout: "x".repeat(MAX_TERMINAL_CAPTURE_BYTES),
        stderr: "one byte or more",
        exitCode: 0,
      },
      { status: 422, stdout: "\ufffd", stderr: "", exitCode: 0 },
      {
        status: 413,
        stdout: "",
        stderr: `[shell-router] stdio exceeded ${MAX_SHELL_STDIO_BYTES} bytes`,
        exitCode: -1,
      },
    ]) {
      output = capture;
      const id = `run-${randomUUID()}`;
      const result = await handleOperationsRoutes(
        context,
        request(1000, id),
        url,
        { captureOutputRequired: true },
      );
      expect(result?.status).toBe(status);
      const body = await result?.json();
      expect(body).toMatchObject({
        runId: id,
        acceptance: "accepted",
        executionStatus: "completed",
        exitCode: capture.exitCode,
      });
      expect(body).not.toHaveProperty("stdout");
      expect(body).not.toHaveProperty("stderr");
      expect(historyStore.read().commands.at(-1)).toMatchObject({
        id,
        exitCode: capture.exitCode,
      });
      const replay = await handleOperationsRoutes(
        context,
        request(1000, id),
        url,
        {
          captureOutputRequired: true,
        },
      );
      expect(replay?.status).toBe(status);
    }
    expect(run).toHaveBeenCalledTimes(4);
  } finally {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});
