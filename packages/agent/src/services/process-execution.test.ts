import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runShell = vi.hoisted(() => vi.fn());
const resolveShellExecutionMode = vi.hoisted(() => vi.fn());

vi.mock("@elizaos/agent/services/shell-execution-router", () => ({
  resolveShellExecutionMode,
  runShell,
}));

import { runTextProcess, runTextProcessSync } from "./process-execution";

describe("runTextProcess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveShellExecutionMode.mockReturnValue("local-yolo");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("routes argv, cwd, timeout, callbacks, and defined env through runShell", async () => {
    const onStdout = vi.fn();
    const onStderr = vi.fn();
    runShell.mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      durationMs: 4,
      sandbox: "host",
    });

    await expect(
      runTextProcess("git", ["status", "--short"], {
        cwd: "/workspace",
        env: {
          DOOLITTLE_TASK_ID: "task-1",
          OMIT_ME: undefined,
        },
        timeoutMs: 1234,
        onStdout,
        onStderr,
        toolName: "doolittle.test",
      }),
    ).resolves.toMatchObject({
      exitCode: 0,
      sandbox: "host",
    });

    expect(runShell).toHaveBeenCalledWith({
      command: "git",
      args: ["status", "--short"],
      cwd: "/workspace",
      env: { DOOLITTLE_TASK_ID: "task-1" },
      timeoutMs: 1234,
      onStdout,
      onStderr,
      toolName: "doolittle.test",
    });
  });

  it("returns a cancellation receipt without invoking the router when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runTextProcess("git", ["status"], {
        abortSignal: controller.signal,
        toolName: "doolittle.test",
      }),
    ).resolves.toEqual({
      exitCode: 130,
      stdout: "",
      stderr: "Command cancelled before execution.",
      durationMs: 0,
      sandbox: "none",
    });
    expect(runShell).not.toHaveBeenCalled();
  });

  it("cancels a routed local process group and strips its private PID marker", async () => {
    vi.useFakeTimers();
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const onStderr = vi.fn();
    const controller = new AbortController();
    let complete: (() => void) | undefined;

    runShell.mockImplementation(
      (request: { onStderr?: (chunk: string) => void }) =>
        new Promise((resolve) => {
          request.onStderr?.("__DOOLITTLE_ROUTER_PID__4321\nwarning\n");
          complete = () =>
            resolve({
              exitCode: 0,
              stdout: "partial output",
              stderr: "__DOOLITTLE_ROUTER_PID__4321\nwarning\n",
              durationMs: 12,
              sandbox: "host",
            });
        }),
    );

    const resultPromise = runTextProcess("node", ["long-task.js"], {
      abortSignal: controller.signal,
      onStderr,
      toolName: "doolittle.test",
    });
    expect(runShell).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "/bin/sh",
        args: expect.arrayContaining([
          "doolittle-router",
          "node",
          "long-task.js",
        ]),
      }),
    );
    expect(onStderr).toHaveBeenCalledWith("warning\n");

    controller.abort();
    expect(kill).toHaveBeenCalledWith(-4321, "SIGINT");
    await vi.advanceTimersByTimeAsync(250);
    expect(kill).toHaveBeenCalledWith(-4321, "SIGKILL");
    complete?.();

    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 130,
      stdout: "partial output",
      stderr: "warning\n",
      sandbox: "host",
    });
  });
});

describe("runTextProcessSync", () => {
  it("executes the synchronous compatibility bridge through the installed router", () => {
    const result = runTextProcessSync(
      process.execPath,
      ["-e", 'process.stdout.write("sync-ok")'],
      { timeoutMs: 10_000, toolName: "doolittle.test.sync" },
    );

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "sync-ok",
      stderr: "",
      sandbox: "host",
    });
  }, 15_000);

  it("rejects router output that cannot fit in the bounded shared buffer", () => {
    expect(() =>
      runTextProcessSync(
        process.execPath,
        ["-e", 'process.stdout.write("x".repeat(2_100_000))'],
        { timeoutMs: 10_000, toolName: "doolittle.test.sync" },
      ),
    ).toThrow("Synchronous shell result exceeded 2 MB.");
  }, 15_000);
});
