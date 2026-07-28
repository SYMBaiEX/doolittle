import type { IAgentRuntime } from "@elizaos/core";
import {
  executeTerminalCommand as executeTerminalCommandThroughFacade,
  formatTerminalCommandResponse,
} from "@/runtime/commands/shell-command-facade";
import type { AppServices } from "@/services";

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
  const result = await executeTerminalCommandThroughFacade(
    runtime,
    services,
    command,
  );
  const response = formatTerminalCommandResponse(result);

  return {
    response,
    exitCode: result.exitCode,
    command: result.command,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    cwd: result.cwd,
    durationMs: result.durationMs,
  };
}
