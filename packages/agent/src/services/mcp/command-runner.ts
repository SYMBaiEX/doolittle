import { runShellCommand } from "../command-process";
import type { McpSettings } from "./status";

export interface McpCommandResult {
  ok: boolean;
  output: string;
  exitCode: number;
}

export function getMissingMcpCommandResult(): McpCommandResult {
  return {
    ok: false,
    output: "MCP_SERVER_COMMAND is not configured.",
    exitCode: 1,
  };
}

export async function runMcpCommand(
  settings: McpSettings,
  args: string[],
  overrideTimeoutMs?: number,
): Promise<McpCommandResult> {
  if (!settings.serverCommand) {
    return getMissingMcpCommandResult();
  }

  const result = await runShellCommand(
    settings.serverCommand,
    args,
    overrideTimeoutMs ?? settings.timeoutMs,
  );

  return {
    ok: result.ok,
    output: result.output,
    exitCode: result.exitCode,
  };
}
