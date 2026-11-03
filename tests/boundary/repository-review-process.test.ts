import { beforeEach, describe, expect, it, vi } from "vitest";
import { runTextProcess } from "../../packages/agent/src/services/process-execution";
import {
  RepositoryReviewProcessError,
  runRepositoryReviewProcess,
} from "../../packages/agent/src/services/repository-review";

vi.mock("../../packages/agent/src/services/process-execution", () => ({
  runTextProcess: vi.fn(),
}));

const request = { command: "gh", args: ["--version"], cwd: "/review-root" };
const success = {
  exitCode: 0,
  stdout: "fixture",
  stderr: "",
  durationMs: 0,
  sandbox: "none",
} as const;
const run = vi.mocked(runTextProcess);
beforeEach(() => {
  run.mockReset();
});

describe("repository review process policy", () => {
  it("retains the time budget, noninteractive environment, and abort-listener cleanup", async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    run.mockResolvedValue(success);
    await expect(
      runRepositoryReviewProcess({ ...request, signal: controller.signal }),
    ).resolves.toEqual({
      exitCode: 0,
      stdout: "fixture",
      stderr: "",
    });
    expect(run).toHaveBeenCalledWith(
      "gh",
      ["--version"],
      expect.objectContaining({
        cwd: "/review-root",
        timeoutMs: 8_000,
        env: { GH_PROMPT_DISABLED: "1", GH_PAGER: "cat", NO_COLOR: "1" },
        toolName: "doolittle.repository-review",
      }),
    );
    const processSignal = run.mock.calls[0][2].abortSignal;
    expect(processSignal?.aborted).toBe(false);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort();
    expect(processSignal?.aborted).toBe(false);
  });

  it("enforces one combined 512 KB output budget for stdout and stderr", async () => {
    run.mockImplementation(async (_command, _args, options) => {
      options.onStdout?.("a".repeat(256 * 1024));
      options.onStderr?.("b".repeat(256 * 1024));
      expect(options.abortSignal?.aborted).toBe(false);
      options.onStderr?.("c");
      expect(options.abortSignal?.aborted).toBe(true);
      return success;
    });
    await expect(runRepositoryReviewProcess(request)).rejects.toMatchObject({
      kind: "output_limit",
    });
  });

  it("forwards a caller cancellation without starting another process", async () => {
    const controller = new AbortController();
    run.mockImplementation(async (_command, _args, options) => {
      controller.abort();
      expect(options.abortSignal?.aborted).toBe(true);
      return { ...success, exitCode: 130 };
    });
    await expect(
      runRepositoryReviewProcess({ ...request, signal: controller.signal }),
    ).rejects.toMatchObject({ kind: "aborted" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("refuses an already cancelled invocation before process execution", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runRepositoryReviewProcess({ ...request, signal: controller.signal }),
    ).rejects.toBeInstanceOf(RepositoryReviewProcessError);
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    [-1, "", "missing"],
    [127, "gh: not found", "missing"],
    [124, "[shell-router] command timed out", "timeout"],
  ] as const)(
    "classifies process exit %s with bounded diagnostics",
    async (exitCode, stderr, kind) => {
      run.mockResolvedValue({ ...success, exitCode, stderr });
      await expect(runRepositoryReviewProcess(request)).rejects.toMatchObject({
        kind,
      });
    },
  );
});
