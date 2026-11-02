import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOOLITTLE_SHELL_SERVICE } from "@doolittle/contracts";
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
    const run = vi.fn(async () => {
      await gate;
      return {
        exitCode: 0,
        stdout: "VERIFIED",
        stderr: "",
        timedOut: false,
        durationMs: 1,
      };
    });
    const backend: ExecutionBackend = {
      name: "local",
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
    const context = {
      runtime: {
        getService: (type: string) =>
          type === DOOLITTLE_SHELL_SERVICE
            ? { run: reopened.run.bind(reopened) }
            : null,
      },
    } as unknown as AppContext;
    const url = new URL("http://127.0.0.1/api/terminal/run");
    const request = new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-eliza-terminal-token": "fixture-terminal-capability",
        "x-eliza-terminal-run-id": runId,
      },
      body: JSON.stringify({
        command: "verify",
        timeoutMs: 1000,
        captureOutput: true,
      }),
    });
    const response = await handleOperationsRoutes(context, request, url, {
      captureOutputRequired: true,
    });
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      runId,
      stdout: "VERIFIED",
      exitCode: 0,
      truncated: false,
    });
    expect(run).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});
