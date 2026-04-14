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
  exitCode: number | undefined;
  command: string;
}> {
  const result = (await runEffectiveShellCommand(
    runtime,
    services,
    command,
  )) as {
    command: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
  };
  const response = [
    `Ran: ${sanitizeTerminalText(result.command, {
      preserveNewlines: false,
      collapseWhitespace: true,
    })}`,
    `Exit: ${result.exitCode}`,
    result.stdout?.trim()
      ? `STDOUT:\n${sanitizeTerminalText(result.stdout.trim())}`
      : undefined,
    result.stderr?.trim()
      ? `STDERR:\n${sanitizeTerminalText(result.stderr.trim())}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    response,
    exitCode: result.exitCode,
    command: result.command,
  };
}
