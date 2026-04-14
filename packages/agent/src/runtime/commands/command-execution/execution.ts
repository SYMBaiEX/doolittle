import { runEffectiveShellCommand } from "@/runtime/native/service-bridge/tooling";
import type { AgentExecutionContext, AgentTurnHooks } from "../../chat";
import { formatShellCommandResponse } from "./formatting";
import type { ShellCommandTurnResult } from "./types";

export async function runStreamingLocalShellCommand(
  command: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<ShellCommandTurnResult> {
  let stdout = "";
  let stderr = "";
  const emit = async (chunk: string) => {
    await hooks?.onResponseProgress?.({
      chunk,
      response: formatShellCommandResponse({
        command,
        exitCode: 0,
        stdout,
        stderr,
      }),
      phase: "command",
    });
  };
  const result = await context.services.terminal.runStreamingLocal(
    command,
    {
      onStdout: (chunk) => {
        stdout += chunk;
        void emit(chunk);
      },
      onStderr: (chunk) => {
        stderr += chunk;
        void emit(chunk);
      },
    },
    undefined,
    hooks?.abortSignal,
  );
  return {
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
  };
}

export async function runRuntimeShellCommand(
  command: string,
  context: AgentExecutionContext,
): Promise<ShellCommandTurnResult> {
  return (await runEffectiveShellCommand(
    context.runtime,
    context.services,
    command,
  )) as ShellCommandTurnResult;
}
