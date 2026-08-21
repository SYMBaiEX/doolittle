import { runProviderCommand } from "@doolittle/provider-transport";
import { describe, expect, it, vi } from "vitest";
import { invokeClaudeCodeCliPrint } from "./cli";

vi.mock("@doolittle/provider-transport", () => ({
  runProviderCommand: vi.fn(async () => ({
    exitCode: 0,
    stdout: "done",
    stderr: "",
    durationMs: 1,
    termination: "exit",
  })),
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

    expect(runProviderCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(["--effort", "high"]),
      }),
    );
    expect(runProviderCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(["--tools", ""]),
      }),
    );
  });

  it("does not mix successful CLI diagnostics into the model response", async () => {
    vi.mocked(runProviderCommand).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "CLAUDE_OK\n",
      stderr: "SessionEnd hook emitted a diagnostic\n",
      durationMs: 10,
      termination: "exit",
    });

    await expect(
      invokeClaudeCodeCliPrint({
        prompt: "hello",
        model: "sonnet",
      }),
    ).resolves.toBe("CLAUDE_OK");
  });

  it("uses Claude native structured output and returns only the schema value", async () => {
    vi.mocked(runProviderCommand).mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: '{"replyText":"CLAUDE_OK"}',
        structured_output: { replyText: "CLAUDE_OK" },
      }),
      stderr: "",
      durationMs: 10,
      termination: "exit",
    });

    await expect(
      invokeClaudeCodeCliPrint({
        prompt: "hello",
        model: "sonnet",
        systemPrompt: "Act only as an inference transport.",
        jsonSchema: {
          type: "object",
          properties: { replyText: { type: "string" } },
          required: ["replyText"],
        },
      }),
    ).resolves.toBe('{"replyText":"CLAUDE_OK"}');

    expect(runProviderCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          "--output-format",
          "json",
          "--json-schema",
          expect.stringContaining('"replyText"'),
          "--system-prompt",
          "Act only as an inference transport.",
        ]),
      }),
    );
  });
});
