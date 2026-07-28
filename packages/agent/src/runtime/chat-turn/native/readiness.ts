import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import { finalizeTurnResponse, isTurnReadinessMessage } from "../finalization";
import type { TurnState } from "../state";
import { recordTrajectoryEvent } from "../trajectory";
import type { TurnPerfTrace } from "./types";

async function finalizeReadinessResponse(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  response: string;
  scheduleProfileObservation: () => void;
  options?: AgentTurnHooks;
  perf: TurnPerfTrace;
  source: string | undefined;
}): Promise<string> {
  const modelSettings = input.turn.settings?.model ?? {};
  recordTrajectoryEvent(input.context, {
    category: "turn",
    event: "turn.shortcut",
    sessionId: input.turn.sessionId,
    runId: input.turn.runId,
    roomId: String(input.turn.roomId),
    source: input.source ?? "cli",
    provider: modelSettings.provider ?? "unknown",
    model: modelSettings.model ?? "unknown",
    text: "[turn:shortcut] provider-readiness",
    metadata: {
      path: "provider-readiness",
      channel: "readiness",
      response: input.response,
      responseChars: input.response.length,
    },
  });
  await finalizeTurnResponse(
    input.context,
    input.turn,
    input.response,
    input.scheduleProfileObservation,
    input.options,
    "readiness",
  );
  input.perf.flush(input.context.runtime.logger, {
    path: "provider-readiness",
    sessionId: input.turn.sessionId,
    source: input.source ?? "cli",
  });
  return input.response;
}

/**
 * Provider configuration failures occur before ElizaOS can run a model-backed
 * message turn. Keep this product readiness response at the application
 * boundary; all configured turns continue into the SDK MessageService.
 */
export async function handleReadyResponseTurn(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  readinessMessage: string | undefined;
  scheduleProfileObservation: () => void;
  options?: AgentTurnHooks;
  perf: TurnPerfTrace;
  source: string | undefined;
}): Promise<string | undefined> {
  if (!isTurnReadinessMessage(input.readinessMessage)) {
    return undefined;
  }
  return finalizeReadinessResponse({
    ...input,
    response: input.readinessMessage,
  });
}
