import {
  formatShellCommandResponse,
  maybeRequireRemoteExecutionApproval,
  runShellCommandForTurn,
} from "@/runtime/commands/command-execution";
import { getEffectiveShellHistory } from "@/runtime/native/service-bridge/tooling";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "../../chat";

export async function handleOperatorTerminalCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<string | undefined> {
  if (trimmed === "/terminal" || trimmed === "/terminal recent") {
    const commands = getEffectiveShellHistory(
      context.runtime,
      context.services,
      10,
    ) as Array<{
      exitCode: number;
      command: string;
      backend?: string;
      backendMode?: string;
      backendEngine?: string;
      timeoutMs?: number;
      durationMs?: number;
      timedOut?: boolean;
      stdout?: string;
      stderr?: string;
    }>;
    return commands.length
      ? commands
          .map(
            (entry) =>
              `- [${entry.exitCode}] ${entry.command}\n  backend=${entry.backend} mode=${entry.backendMode ?? "n/a"} engine=${entry.backendEngine ?? "n/a"} timeout=${entry.timeoutMs ?? "n/a"}ms duration=${entry.durationMs ?? "n/a"}ms timedOut=${entry.timedOut ? "yes" : "no"}\n  stdout=${entry.stdout?.slice(0, 160) || "(empty)"}\n  stderr=${entry.stderr?.slice(0, 160) || "(empty)"}`,
          )
          .join("\n")
      : "No terminal commands recorded.";
  }

  if (trimmed.startsWith("/terminal run ")) {
    const command = trimmed.replace("/terminal run ", "").trim();
    if (!command) {
      return "Usage: /terminal run <command>";
    }
    const approvalPrompt = await maybeRequireRemoteExecutionApproval(
      input,
      context,
      command,
      hooks,
    );
    if (approvalPrompt) {
      return approvalPrompt;
    }
    const result = await runShellCommandForTurn(command, context, hooks);
    const response = formatShellCommandResponse(result);
    await hooks?.onResponseProgress?.({
      chunk: response,
      response,
      phase: "command",
    });
    return response;
  }

  return undefined;
}
