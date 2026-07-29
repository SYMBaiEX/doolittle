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
  });
});
