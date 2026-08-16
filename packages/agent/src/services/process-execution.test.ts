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
    vi.unstubAllEnvs();
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

  it("cancels a routed Windows process tree before delayed work can complete", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    vi.stubEnv("SystemRoot", "C:\\Windows");
    vi.useFakeTimers();
    const controller = new AbortController();
    const onStdout = vi.fn();
    let completeProcess: (() => void) | undefined;
    let delayedSideEffect = false;
    let sideEffectTimer: ReturnType<typeof setTimeout> | undefined;

    runShell.mockImplementation(
      (request: {
        command: string;
        args: readonly string[];
        onStderr?: (chunk: string) => void;
      }) => {
        if (request.command === "C:\\Windows\\System32\\taskkill.exe") {
          if (sideEffectTimer) clearTimeout(sideEffectTimer);
          completeProcess?.();
          return Promise.resolve({
            exitCode: 0,
            stdout: "SUCCESS",
            stderr: "",
            durationMs: 2,
            sandbox: "host",
          });
        }
        return new Promise((resolve) => {
          request.onStderr?.("__DOOLITTLE_ROUTER_PID__4321\r\n");
          sideEffectTimer = setTimeout(() => {
            delayedSideEffect = true;
          }, 1_000);
          completeProcess = () =>
            resolve({
              exitCode: 1,
              stdout: "partial output",
              stderr: "__DOOLITTLE_ROUTER_PID__4321\r\n",
              durationMs: 12,
              sandbox: "host",
            });
        });
      },
    );

    const hostileArgument = '"; Set-Content C:\\private.txt exposed; #';
    const resultPromise = runTextProcess(
      "node.exe",
      ["long-task.js", hostileArgument],
      {
        abortSignal: controller.signal,
        cwd: "C:\\workspace",
        env: { SystemRoot: "C:\\workspace\\shadow" },
        onStdout,
        toolName: "doolittle.test",
      },
    );
    expect(runShell).toHaveBeenCalledWith(
      expect.objectContaining({
        command:
          "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      }),
    );
    const wrapperRequest = runShell.mock.calls[0]?.[0] as {
      args: readonly string[];
    };
    expect(wrapperRequest.args).toContain("-Command");
    expect(wrapperRequest.args.join(" ")).not.toContain(hostileArgument);

    controller.abort();
    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 130,
      stdout: "partial output",
      stderr: "Command cancelled by operator.",
      sandbox: "host",
    });
    expect(runShell).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "C:\\Windows\\System32\\taskkill.exe",
        args: ["/PID", "4321", "/T", "/F"],
        timeoutMs: 5_000,
      }),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(delayedSideEffect).toBe(false);
    expect(onStdout).not.toHaveBeenCalled();
  });

  it("keeps a missing Windows target from being treated as a successful invocation", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    vi.stubEnv("SystemRoot", "C:\\Windows");
    runShell.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "The term 'missing.exe' is not recognized.",
      durationMs: 3,
      sandbox: "host",
    });

    await expect(
      runTextProcess("missing.exe", [], {
        abortSignal: new AbortController().signal,
        toolName: "doolittle.test",
      }),
    ).resolves.toMatchObject({
      exitCode: 1,
      stderr: "The term 'missing.exe' is not recognized.",
    });

    const wrapperRequest = runShell.mock.calls[0]?.[0] as {
      args: readonly string[];
    };
    const wrapperScript = wrapperRequest.args.at(-1);
    expect(wrapperScript).toContain("$invocationSucceeded = $?");
    expect(wrapperScript).toContain("if ($invocationSucceeded) { exit 0 }");
    expect(wrapperScript).toContain("exit 1");
  });

  it("reports a nonzero Windows tree-kill result instead of claiming cancellation", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    vi.stubEnv("SystemRoot", "D:\\Windows");
    const controller = new AbortController();
    let completeProcess: (() => void) | undefined;

    runShell.mockImplementation(
      (request: { command: string; onStderr?: (chunk: string) => void }) => {
        if (request.command === "D:\\Windows\\System32\\taskkill.exe") {
          return Promise.resolve({
            exitCode: 5,
            stdout: "",
            stderr: "Access is denied.",
            durationMs: 2,
            sandbox: "host",
          });
        }
        return new Promise((resolve) => {
          request.onStderr?.("__DOOLITTLE_ROUTER_PID__9876\r\n");
          completeProcess = () =>
            resolve({
              exitCode: 0,
              stdout: "side effect completed",
              stderr: "__DOOLITTLE_ROUTER_PID__9876\r\n",
              durationMs: 1_000,
              sandbox: "host",
            });
        });
      },
    );

    const resultPromise = runTextProcess("dangerous.exe", [], {
      abortSignal: controller.signal,
      toolName: "doolittle.test",
    });
    controller.abort();
    await Promise.resolve();
    completeProcess?.();

    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 1,
      stdout: "side effect completed",
      stderr: expect.stringContaining(
        "Command cancellation could not be confirmed; the process tree may have continued: taskkill exited with code 5: Access is denied.",
      ),
    });
  });

  it("reports a rejected Windows tree-kill request instead of claiming cancellation", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    vi.stubEnv("SystemRoot", "C:\\Windows");
    const controller = new AbortController();
    let completeProcess: (() => void) | undefined;

    runShell.mockImplementation(
      (request: { command: string; onStderr?: (chunk: string) => void }) => {
        if (request.command === "C:\\Windows\\System32\\taskkill.exe") {
          return Promise.reject(new Error("capability denied"));
        }
        return new Promise((resolve) => {
          request.onStderr?.("__DOOLITTLE_ROUTER_PID__7654\r\n");
          completeProcess = () =>
            resolve({
              exitCode: 1,
              stdout: "",
              stderr: "__DOOLITTLE_ROUTER_PID__7654\r\ncommand failed",
              durationMs: 20,
              sandbox: "host",
            });
        });
      },
    );

    const resultPromise = runTextProcess("dangerous.exe", [], {
      abortSignal: controller.signal,
      toolName: "doolittle.test",
    });
    controller.abort();
    await Promise.resolve();
    completeProcess?.();

    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining(
        "Command cancellation could not be confirmed; the process tree may have continued: taskkill failed: capability denied",
      ),
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
