import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import {
  executeTerminalCommandForTurn,
  formatTerminalCommandResponse,
  requestTerminalCommandApproval,
} from "@/runtime/commands/shell-command-facade";
import type { ChatTurnRequest, CronJobRuntimeOverrides } from "@/types/runtime";
import { finalizeTurnResponse } from "./finalization";
import {
  type PreparedTurnState,
  prepareTurnState,
  startTrackedTurn,
  storeSessionMessage,
} from "./state";
import { recordTrajectoryEvent } from "./trajectory";

type TurnPerfTrace = {
  mark(phase: string): void;
  flush(
    logger: AgentExecutionContext["runtime"]["logger"] | undefined,
    metadata: Record<string, unknown>,
  ): void;
};

type ShellCommandTurnOptions = AgentTurnHooks & {
  runtimeOverrides?: CronJobRuntimeOverrides;
  personalityId?: string;
};

type ShellExecutionContext = {
  maybeRequireRemoteExecutionApproval: typeof requestTerminalCommandApproval;
  runShellCommandForTurn: typeof executeTerminalCommandForTurn;
  formatShellCommandResponse: typeof formatTerminalCommandResponse;
};

const shellCommandContext: ShellExecutionContext = {
  maybeRequireRemoteExecutionApproval: requestTerminalCommandApproval,
  runShellCommandForTurn: executeTerminalCommandForTurn,
  formatShellCommandResponse: formatTerminalCommandResponse,
};

export async function runShellPostCommandTurn(
  input: {
    input: ChatTurnRequest;
    effectiveInput: ChatTurnRequest;
    context: AgentExecutionContext;
    options?: ShellCommandTurnOptions;
    perf: TurnPerfTrace;
    preparedTurn?: PreparedTurnState;
  },
  executionContext: ShellExecutionContext = shellCommandContext,
): Promise<string | undefined> {
  const trimmedMessage = input.effectiveInput.message.trim();
  if (!trimmedMessage.startsWith("!")) {
    return undefined;
  }

  const command = trimmedMessage.slice(1).trim();
  const { turn, scheduleProfileObservation } =
    input.preparedTurn ?? prepareTurnState(input.input, input.context);
  startTrackedTurn(input.input, input.context, turn);

  if (!command) {
    const usageMessage = await finalizeTurnResponse(
      input.context,
      turn,
      "Usage: !<shell command>",
      scheduleProfileObservation,
      input.options,
      "command",
    );
    input.perf.flush(input.context.runtime.logger, {
      path: "shell-usage-error",
      sessionId: turn.sessionId,
      source: input.input.source ?? "cli",
    });
    return usageMessage;
  }

  const approvalPrompt =
    await executionContext.maybeRequireRemoteExecutionApproval(
      input.input,
      input.context,
      command,
      input.options,
    );

  if (approvalPrompt) {
    input.context.services.runController.setPendingApprovals(turn.sessionId, 1);
    storeSessionMessage(input.context, {
      sessionId: turn.sessionId,
      roomId: turn.roomId,
      entityId: turn.entityId,
      role: "assistant",
      text: approvalPrompt,
    });
    input.context.services.runController.finishTurn(turn.sessionId, "complete");
    scheduleProfileObservation();
    input.perf.flush(input.context.runtime.logger, {
      path: "shell-approval",
      sessionId: turn.sessionId,
      source: input.input.source ?? "cli",
    });
    return approvalPrompt;
  }

  const shellAction = `shell:${command}`;
  recordTrajectoryEvent(input.context, {
    category: "tool",
    event: "tool.request",
    sessionId: turn.sessionId,
    runId: turn.runId,
    roomId: String(turn.roomId),
    source: input.input.source ?? "cli",
    text: `[tool:request] ${shellAction}`,
    metadata: {
      tool: "shell",
      command,
    },
  });
  input.context.services.runController.noteActionStarted(
    turn.sessionId,
    shellAction,
  );

  let result: Awaited<
    ReturnType<typeof executionContext.runShellCommandForTurn>
  >;
  try {
    result = await executionContext.runShellCommandForTurn(
      command,
      input.context,
      input.options,
    );
  } catch (error) {
    recordTrajectoryEvent(input.context, {
      category: "tool",
      event: "tool.error",
      sessionId: turn.sessionId,
      runId: turn.runId,
      roomId: String(turn.roomId),
      source: input.input.source ?? "cli",
      text: `[tool:error] ${shellAction}`,
      metadata: {
        tool: "shell",
        command,
        error,
      },
    });
    input.context.services.runController.noteActionCompleted(
      turn.sessionId,
      shellAction,
    );
    input.context.services.runController.finishTurn(
      turn.sessionId,
      "error",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }

  input.context.services.runController.noteActionCompleted(
    turn.sessionId,
    shellAction,
  );

  const shellResponse = executionContext.formatShellCommandResponse(result);
  recordTrajectoryEvent(input.context, {
    category: "tool",
    event: "tool.response",
    sessionId: turn.sessionId,
    runId: turn.runId,
    roomId: String(turn.roomId),
    source: input.input.source ?? "cli",
    elapsedMs: result.durationMs,
    text: `[tool:response] ${shellAction} exit=${result.exitCode}`,
    metadata: {
      tool: "shell",
      command,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      formattedResponse: shellResponse,
    },
  });
  await finalizeTurnResponse(
    input.context,
    turn,
    shellResponse,
    scheduleProfileObservation,
    input.options,
    "command",
  );
  input.perf.mark("shell-command");
  input.perf.flush(input.context.runtime.logger, {
    path: "shell-command",
    sessionId: turn.sessionId,
    source: input.input.source ?? "cli",
  });
  return shellResponse;
}
