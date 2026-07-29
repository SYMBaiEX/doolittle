import { runShell } from "@elizaos/agent/services/shell-execution-router";
import { describe, expect, it, vi } from "vitest";
import { invokeClaudeCodeCliPrint } from "./cli";

vi.mock("@elizaos/agent/services/shell-execution-router", () => ({
  runShell: vi.fn(async () => ({ exitCode: 0, stdout: "done", stderr: "" })),
}));

describe("invokeClaudeCodeCliPrint", () => {
  it("passes supported effort through the native Claude CLI invocation", async () => {
    await expect(
      invokeClaudeCodeCliPrint({
        prompt: "review this",
        model: "claude-sonnet-5",
        effort: "high",
      }),
    ).resolves.toBe("done");

    expect(runShell).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(["--effort", "high"]),
      }),
    );
    expect(runShell).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(["--tools", ""]),
      }),
    );
  });

  it("does not mix successful CLI diagnostics into the model response", async () => {
    vi.mocked(runShell).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "CLAUDE_OK\n",
      stderr: "SessionEnd hook emitted a diagnostic\n",
      durationMs: 10,
      sandbox: "host",
    });

    await expect(
      invokeClaudeCodeCliPrint({
        prompt: "hello",
        model: "sonnet",
      }),
    ).resolves.toBe("CLAUDE_OK");
  });
});
