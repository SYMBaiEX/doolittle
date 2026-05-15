import type { IAgentRuntime } from "@elizaos/core";
import { runEffectiveShellCommand } from "@/runtime/native/service-bridge/tooling";
import type { AppServices } from "@/services";
import { sanitizeTerminalText } from "@/utils/terminal-text";

export async function executeTerminalCommand(
  runtime: IAgentRuntime,
  services: AppServices,
  command: string,
): Promise<{
  response: string;
  exitCode: number;
  command: string;
  stdout: string;
  stderr: string;
  cwd: string;
  durationMs?: number;
}> {
  const rawResult = await runEffectiveShellCommand(runtime, services, command);
  const result =
    rawResult && typeof rawResult === "object"
      ? (rawResult as {
          command?: string;
          exitCode?: number;
          stdout?: string;
          stderr?: string;
          cwd?: string;
          durationMs?: number;
        })
      : {
          command,
          exitCode: 0,
          stdout: String(rawResult ?? ""),
          stderr: "",
          cwd: services.workspace.root(),
        };
  const executedCommand = result.command ?? command;
  const exitCode =
    typeof result.exitCode === "number" && Number.isFinite(result.exitCode)
      ? result.exitCode
      : 0;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const cwd = result.cwd ?? services.workspace.root();
  const response = [
    `Ran: ${sanitizeTerminalText(executedCommand, {
      preserveNewlines: false,
      collapseWhitespace: true,
    })}`,
    `Exit: ${exitCode}`,
    stdout.trim()
      ? `STDOUT:\n${sanitizeTerminalText(stdout.trim())}`
      : undefined,
    stderr.trim()
      ? `STDERR:\n${sanitizeTerminalText(stderr.trim())}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    response,
    exitCode,
    command: executedCommand,
    stdout,
    stderr,
    cwd,
    durationMs: result.durationMs,
  };
}
