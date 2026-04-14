import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import { isSimpleSocialMessage } from "@/runtime/turn-classification/message";
import { finalizeTurnResponse, isTurnReadinessMessage } from "../finalization";
import { buildSimpleGreetingReply } from "../response-shaping";
import type { TurnState } from "../state";
import type { TurnPerfTrace } from "./types";

export async function finalizeNativeShortcut(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  response: string;
  scheduleProfileObservation: () => void;
  options?: AgentTurnHooks;
  channel: "model" | "readiness";
  perf: TurnPerfTrace;
  path: string;
  source: string | undefined;
  markPhase?: string;
}): Promise<string> {
  await finalizeTurnResponse(
    input.context,
    input.turn,
    input.response,
    input.scheduleProfileObservation,
    input.options,
    input.channel,
  );
  if (input.markPhase) {
    input.perf.mark(input.markPhase);
  }
  input.perf.flush(input.context.runtime.logger, {
    path: input.path,
    sessionId: input.turn.sessionId,
    source: input.source ?? "cli",
  });
  return input.response;
}

export async function handleSimpleGreetingTurn(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  message: string;
  scheduleProfileObservation: () => void;
  options?: AgentTurnHooks;
  perf: TurnPerfTrace;
  source: string | undefined;
}): Promise<string | undefined> {
  if (!input.turn.localInteractive || !isSimpleSocialMessage(input.message)) {
    return undefined;
  }
  const response = buildSimpleGreetingReply(input.message);
  return finalizeNativeShortcut({
    context: input.context,
    turn: input.turn,
    response,
    scheduleProfileObservation: input.scheduleProfileObservation,
    options: input.options,
    channel: "model",
    perf: input.perf,
    path: "simple-greeting",
    source: input.source,
  });
}

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
  return finalizeNativeShortcut({
    context: input.context,
    turn: input.turn,
    response: input.readinessMessage,
    scheduleProfileObservation: input.scheduleProfileObservation,
    options: input.options,
    channel: "readiness",
    perf: input.perf,
    path: "provider-readiness",
    source: input.source,
  });
}

export async function handleCachedInformationalTurn(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  cachedResponse: string | undefined;
  scheduleProfileObservation: () => void;
  options?: AgentTurnHooks;
  perf: TurnPerfTrace;
  source: string | undefined;
}): Promise<string | undefined> {
  if (!input.cachedResponse) {
    return undefined;
  }
  return finalizeNativeShortcut({
    context: input.context,
    turn: input.turn,
    response: input.cachedResponse,
    scheduleProfileObservation: input.scheduleProfileObservation,
    options: input.options,
    channel: "model",
    perf: input.perf,
    path: "informational-response-cache",
    source: input.source,
  });
}
