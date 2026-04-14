import type { AgentExecutionContext } from "@/runtime/chat";
import type { TurnExecutionPolicy } from "@/runtime/turn-classification/types";
import type { TurnState } from "../state";

export type SettingsSnapshot = ReturnType<
  AgentExecutionContext["services"]["settings"]["get"]
>;

export type TurnPerfTrace = {
  mark(phase: string): void;
  flush(
    logger: AgentExecutionContext["runtime"]["logger"] | undefined,
    metadata: Record<string, unknown>,
  ): void;
};

export type NativeTurnSetup = {
  turn: TurnState;
  scheduleProfileObservation: () => void;
  derivedTurnPolicy: TurnExecutionPolicy;
  turnClassification: {
    simpleChat: boolean;
    likelyLocalTask: boolean;
    requiresFullContext: boolean;
    actionOriented: boolean;
    informationalOnly: boolean;
    shouldUseMultiStep: boolean;
  };
  settingsBefore: SettingsSnapshot;
};
