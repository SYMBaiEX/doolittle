import { beforeEach, describe, expect, it, vi } from "vitest";

const sandboxManager = vi.hoisted(() => ({
  getContainerWorkspacePath: vi.fn((hostPath: string) =>
    hostPath.replace(/^.*doolittle-e2b/, "/workspace"),
  ),
  run: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@elizaos/agent/services/sandbox-manager", () => ({
  SandboxManager: class {
    getContainerWorkspacePath = sandboxManager.getContainerWorkspacePath;
    run = sandboxManager.run;
    start = sandboxManager.start;
    stop = sandboxManager.stop;
  },
}));

import { LocalSandboxService } from "./service";

describe("local sandbox service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses SandboxManager lifecycle and argv-safe execution", async () => {
    sandboxManager.run.mockResolvedValue({
      exitCode: 0,
      stdout: "ok\n",
      stderr: "",
      durationMs: 1,
      executedInSandbox: true,
    });

    const service = await LocalSandboxService.start();
    const result = await service.executeCode("console.log('ok')", "javascript");

    expect(sandboxManager.start).toHaveBeenCalledOnce();
    expect(sandboxManager.run).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd: process.execPath,
        args: ["-e", "console.log('ok')"],
        workdir: expect.stringMatching(/^\/workspace\//),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      text: "ok",
      stdout: "ok\n",
      language: "javascript",
    });

    await service.stop();
    expect(sandboxManager.stop).toHaveBeenCalledOnce();
  });

  it("returns the E2B-compatible error shape when execution is rejected", async () => {
    sandboxManager.run.mockRejectedValue(new Error("sandbox unavailable"));
    const service = await LocalSandboxService.start();

    await expect(service.executeCode("print('ok')")).resolves.toMatchObject({
      success: false,
      text: "sandbox unavailable",
      stderr: "sandbox unavailable",
      error: {
        value: "sandbox unavailable",
        traceback: "sandbox unavailable",
      },
      language: "python",
    });

    await service.stop();
  });

  it("preserves command failures returned by SandboxManager", async () => {
    sandboxManager.run.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "command failed\n",
      durationMs: 1,
      executedInSandbox: true,
    });
    const service = await LocalSandboxService.start();

    await expect(service.executeCode("exit 1", "bash")).resolves.toEqual(
      expect.objectContaining({
        success: false,
        text: "command failed",
        stdout: "",
        stderr: "command failed\n",
        error: {
          value: "command failed",
          traceback: "command failed",
        },
        language: "bash",
      }),
    );

    await service.stop();
  });
});
