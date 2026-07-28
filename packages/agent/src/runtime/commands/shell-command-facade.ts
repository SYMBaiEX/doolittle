import type { IAgentRuntime } from "@elizaos/core";
import { runEffectiveShellCommand } from "@/runtime/native/service-bridge/tooling";
import type { AppServices } from "@/services";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "../chat";
import type { ShellCommandTurnResult } from "./command-execution";
import {
  formatShellCommandResponse,
  maybeRequireRemoteExecutionApproval,
  runShellCommandForTurn,
} from "./command-execution";

export type TerminalCommandResult = ShellCommandTurnResult & { cwd: string };

function normalizeTerminalCommandResult(
  rawResult: unknown,
  command: string,
  workspaceRoot: string,
): TerminalCommandResult {
  const result =
    rawResult && typeof rawResult === "object"
      ? (rawResult as Partial<TerminalCommandResult>)
      : { stdout: String(rawResult ?? "") };

  return {
    command: result.command ?? command,
    exitCode:
      typeof result.exitCode === "number" && Number.isFinite(result.exitCode)
        ? result.exitCode
        : 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    cwd: result.cwd ?? workspaceRoot,
    durationMs: result.durationMs,
  };
}

/** Shared non-turn execution seam for official actions and direct intents. */
export async function executeTerminalCommand(
  runtime: IAgentRuntime,
  services: AppServices,
  command: string,
): Promise<TerminalCommandResult> {
  const rawResult = await runEffectiveShellCommand(runtime, services, command);
  return normalizeTerminalCommandResult(
    rawResult,
    command,
    services.workspace.root(),
  );
}

export function formatTerminalCommandResponse(
  result: ShellCommandTurnResult,
): string {
  return formatShellCommandResponse(result);
}

export async function requestTerminalCommandApproval(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  command: string,
  hooks?: AgentTurnHooks,
): Promise<string | undefined> {
  return maybeRequireRemoteExecutionApproval(input, context, command, hooks);
}

export async function executeTerminalCommandForTurn(
  command: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<ShellCommandTurnResult> {
  return runShellCommandForTurn(command, context, hooks);
}
