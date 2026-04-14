import type { AgentExecutionContext } from "@/runtime/chat";
import { classifyTurnMessage } from "@/runtime/turn-classification/message";
import { deriveTurnExecutionPolicy } from "@/runtime/turn-classification/policy";
import type { ChatTurnRequest } from "@/types/runtime";
import {
  type PreparedTurnState,
  prepareTurnState,
  startTrackedTurn,
} from "../state";
import type { NativeTurnSetup } from "./types";

export function prepareNativeTurnSetup(input: {
  input: ChatTurnRequest;
  effectiveInput: ChatTurnRequest;
  context: AgentExecutionContext;
  preparedTurn?: PreparedTurnState;
}): NativeTurnSetup {
  const { turn, scheduleProfileObservation } =
    input.preparedTurn ?? prepareTurnState(input.input, input.context);
  const derivedTurnPolicy = deriveTurnExecutionPolicy(
    input.effectiveInput.message,
    turn.settings.agent,
    {
      localInteractive: turn.localInteractive,
    },
  );
  startTrackedTurn(input.input, input.context, turn, derivedTurnPolicy);

  return {
    turn,
    scheduleProfileObservation,
    derivedTurnPolicy,
    turnClassification: classifyTurnMessage(input.effectiveInput.message),
    settingsBefore: turn.settings,
  };
}
