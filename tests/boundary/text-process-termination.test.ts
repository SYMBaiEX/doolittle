import { runShell } from "@elizaos/agent/services/shell-execution-router";
import { afterEach, expect, it, vi } from "vitest";
import { runTextProcess } from "../../packages/agent/src/services/process-execution";

vi.mock("@elizaos/agent/services/shell-execution-router", () => ({
  resolveShellExecutionMode: () => "local-yolo",
  runShell: vi.fn(),
}));

const groupId = 42_001;
const signalError = (code: string) => Object.assign(new Error(code), { code });

function cancelOwnedProcess() {
  const abort = new AbortController();
  vi.mocked(runShell).mockImplementationOnce(async (request) => {
    request.onStderr?.(`__DOOLITTLE_ROUTER_PID__${groupId}\n`);
    request.onStdout?.("output");
    return {
      exitCode: -1,
      stdout: "output",
      stderr: `__DOOLITTLE_ROUTER_PID__${groupId}\n`,
      durationMs: 0,
      sandbox: "host",
    };
  });
  return runTextProcess("git", ["status"], {
    toolName: "doolittle.termination-test",
    timeoutMs: 5_000,
    requireOwnedCancellation: true,
    abortSignal: abort.signal,
    onStdout: () => abort.abort(),
  });
}

afterEach(() => vi.useRealTimers());

it.skipIf(process.platform !== "darwin")(
  "confirms group exit after a transient Darwin EPERM",
  async () => {
    vi.useFakeTimers();
    let inspections = 0;
    const signal = vi.spyOn(process, "kill").mockImplementation((pid, kind) => {
      expect(pid).toBe(-groupId);
      if (kind === 0)
        throw signalError(inspections++ === 0 ? "EPERM" : "ESRCH");
      return true;
    });
    const completed = expect(cancelOwnedProcess()).resolves.toMatchObject({
      exitCode: 130,
    });
    await vi.advanceTimersByTimeAsync(5);
    await completed;
    expect(signal).toHaveBeenCalledTimes(3);
    expect(signal).not.toHaveBeenCalledWith(-groupId, "SIGKILL");
  },
);

it.skipIf(process.platform !== "darwin")(
  "fails closed when the group still cannot be inspected at the deadline",
  async () => {
    vi.useFakeTimers();
    vi.spyOn(process, "kill").mockImplementation((pid, kind) => {
      expect(pid).toBe(-groupId);
      if (kind !== "SIGINT") throw signalError("EPERM");
      return true;
    });
    const rejected = expect(cancelOwnedProcess()).rejects.toMatchObject({
      code: "TEXT_PROCESS_TERMINATION_UNCONFIRMED",
    });
    await vi.advanceTimersByTimeAsync(1_250);
    await rejected;
  },
);
