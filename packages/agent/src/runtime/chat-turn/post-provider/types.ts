import type { ActionResult } from "@elizaos/core";
import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type { ChatTurnRequest } from "@/types/runtime";
import type { TurnState } from "../state";

export type PostProviderSettingsSnapshot = ReturnType<
  AgentExecutionContext["services"]["settings"]["get"]
>;

export interface PostProviderTurnInput {
  input: ChatTurnRequest;
  effectiveInput: ChatTurnRequest;
  context: AgentExecutionContext;
  options?: AgentTurnHooks;
  turn: TurnState;
  response: string;
  runFailureMessage?: string;
  actionResults?: ActionResult[];
  settingsDuring: PostProviderSettingsSnapshot;
  scheduleProfileObservation: () => void;
}

export interface PostProviderFinalResult {
  kind: "final";
  response: string;
  runFailureMessage?: string;
  observedActionCount: number;
  usedFallback: boolean;
}

export type PostProviderTurnResult = PostProviderFinalResult;
