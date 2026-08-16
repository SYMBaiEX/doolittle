import { runEffectiveShellCommand } from "@/runtime/native/service-bridge/tooling";
import type { AgentExecutionContext, AgentTurnHooks } from "../../chat";
import { formatShellCommandResponse } from "./formatting";
import type { ShellCommandTurnResult } from "./types";

function throwIfCommandAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw (
    signal.reason ??
    new DOMException("The terminal command was cancelled.", "AbortError")
  );
}

export async function runStreamingLocalShellCommand(
  command: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<ShellCommandTurnResult> {
  let stdout = "";
  let stderr = "";
  const emit = async (chunk: string) => {
    if (hooks?.abortSignal?.aborted) return;
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
        if (hooks?.abortSignal?.aborted) return;
        stdout += chunk;
        void emit(chunk);
      },
      onStderr: (chunk) => {
        if (hooks?.abortSignal?.aborted) return;
        stderr += chunk;
        void emit(chunk);
      },
    },
    undefined,
    hooks?.abortSignal,
  );
  throwIfCommandAborted(hooks?.abortSignal);
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
  hooks?: AgentTurnHooks,
): Promise<ShellCommandTurnResult> {
  const result = (await runEffectiveShellCommand(
    context.runtime,
    command,
    undefined,
    hooks?.abortSignal,
  )) as ShellCommandTurnResult;
  throwIfCommandAborted(hooks?.abortSignal);
  return result;
}
