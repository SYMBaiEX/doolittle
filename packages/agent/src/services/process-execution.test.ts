import { beforeEach, describe, expect, it, vi } from "vitest";

const runShell = vi.hoisted(() => vi.fn());

vi.mock("@elizaos/agent/services/shell-execution-router", () => ({
  runShell,
}));

import { runTextProcess } from "./process-execution";

describe("runTextProcess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
