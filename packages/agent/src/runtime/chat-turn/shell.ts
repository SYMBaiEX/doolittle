import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import {
  formatShellCommandResponse,
  maybeRequireRemoteExecutionApproval,
  runShellCommandForTurn,
} from "@/runtime/commands/command-execution";
import type { ChatTurnRequest, CronJobRuntimeOverrides } from "@/types/runtime";
import { finalizeTurnResponse } from "./finalization";
import {
  type PreparedTurnState,
  prepareTurnState,
  startTrackedTurn,
  storeSessionMessage,
} from "./state";

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
  maybeRequireRemoteExecutionApproval: typeof maybeRequireRemoteExecutionApproval;
  runShellCommandForTurn: typeof runShellCommandForTurn;
  formatShellCommandResponse: typeof formatShellCommandResponse;
};

const shellCommandContext: ShellExecutionContext = {
  maybeRequireRemoteExecutionApproval,
  runShellCommandForTurn,
  formatShellCommandResponse,
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
