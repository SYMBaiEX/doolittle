import type { AgentExecutionContext } from "@/runtime/chat";
import type { RunDepth, ToolProgressMode } from "@/types/runtime";
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

/**
 * Product execution limits mapped directly onto ElizaOS MessageService
 * options. Intent and context selection belong to the SDK message handler;
 * Doolittle only supplies the user-configured execution budget.
 */
export type NativeMessagePolicy = {
  runDepth: RunDepth;
  maxIterations: number;
  toolProgressMode: ToolProgressMode;
  useMultiStep: boolean;
};

export type NativeTurnSetup = {
  turn: TurnState;
  scheduleProfileObservation: () => void;
  messagePolicy: NativeMessagePolicy;
  settingsBefore: SettingsSnapshot;
};
