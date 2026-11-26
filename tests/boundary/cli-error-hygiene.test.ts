import { describe, expect, it, vi } from "vitest";
import { buildHelpText } from "../../apps/cli/src/cli/help-text";
import { restoreTerminalState } from "../../apps/cli/src/cli/render-utils";
import { formatShellCommandResponse } from "../../packages/agent/src/runtime/commands/command-execution/formatting";

describe("CLI error and output hygiene", () => {
  it("restores terminal control state only for terminal streams", () => {
    const pipedWrite = vi.fn();
    restoreTerminalState({
      write: pipedWrite,
      isTTY: false,
    } as unknown as NodeJS.WriteStream);
    expect(pipedWrite).not.toHaveBeenCalled();

    const ttyWrite = vi.fn();
    restoreTerminalState({
      write: ttyWrite,
      isTTY: true,
    } as unknown as NodeJS.WriteStream);
    expect(ttyWrite).toHaveBeenCalledWith("\x1b[0m\x1b[?25h\x1b[?2004l");
  });

  it("preserves legitimate long unbroken shell output tokens", () => {
    const token = "x".repeat(180);
    const rendered = formatShellCommandResponse({
      command: "python3 fixture",
      stdout: token,
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    });

    expect(rendered).toContain(token);
    expect(rendered).not.toContain(`${"x".repeat(159)}…`);
  });

  it("aligns slash-command descriptions in shell help", () => {
    const lines = buildHelpText("Doolittle").split("\n");
    const rows: Array<[string, string]> = [
      ["/status", "Runtime, provider, and startup readiness"],
      ["/accounts doctor", "Startup and linked-account diagnostics"],
      ["/gateway readiness", "Transport readiness and channel state"],
      ["/sessions list", "Review recent sessions"],
      ["/jobs start <prompt>", "Start a detached background run"],
      ["/jobs cancel <id>", "Cancel a background run"],
    ];

    for (const [command, description] of rows) {
      const line = lines.find((entry) => entry.startsWith(`  ${command}`));
      expect(line, command).toBeDefined();
      expect(line?.indexOf(description), command).toBe(24);
    }
  });
});
