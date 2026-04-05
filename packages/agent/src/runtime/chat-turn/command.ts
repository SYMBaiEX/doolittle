import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type { buildCommandResponse } from "@/runtime/chat-command-router";
import type { ChatTurnRequest } from "@/types/runtime";
import {
  type PreparedTurnState,
  startTrackedTurn,
  storeSessionMessage,
} from "./state";

type TurnPerfTrace = {
  flush(
    logger: AgentExecutionContext["runtime"]["logger"] | undefined,
    metadata: Record<string, unknown>,
  ): void;
};

type CommandDependencies = {
  buildCommandResponse: typeof buildCommandResponse;
  runAnalysis: (prompt: string, label: string) => Promise<string>;
  runDelegationTaskInWorker: (
    taskId: string,
    options?: { assumeRunning?: boolean },
  ) => Promise<
    ReturnType<AgentExecutionContext["services"]["delegation"]["get"]>
  >;
};

export async function runSlashCommandTurn(
  input: {
    input: ChatTurnRequest;
    context: AgentExecutionContext;
    options?: AgentTurnHooks;
    perf: TurnPerfTrace;
    preparedTurn: PreparedTurnState;
  },
  dependencies: CommandDependencies,
): Promise<string | undefined> {
  const response = await dependencies.buildCommandResponse(
    input.input,
    input.context,
    input.options,
    {
      runAnalysis: dependencies.runAnalysis,
      runDelegationTaskInWorker: dependencies.runDelegationTaskInWorker,
    },
  );
  if (!response) {
    return undefined;
  }

  const { turn, scheduleProfileObservation } = input.preparedTurn;
  startTrackedTurn(input.input, input.context, turn);
  storeSessionMessage(input.context, {
    sessionId: turn.sessionId,
    roomId: turn.roomId,
    entityId: turn.entityId,
    role: "assistant",
    text: response,
  });
  input.context.services.runController.finishTurn(turn.sessionId, "complete");
  scheduleProfileObservation();
  input.perf.flush(input.context.runtime.logger, {
    path: "slash-command",
    sessionId: turn.sessionId,
    source: input.input.source ?? "cli",
  });
  return response;
}
