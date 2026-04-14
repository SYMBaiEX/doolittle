import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type { ChatTurnRequest } from "@/types/runtime";
import type { DirectLocalIntentLoader } from "../local-intent-orchestration/types";
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
  settingsDuring: PostProviderSettingsSnapshot;
  responseCacheKey?: string;
  scheduleProfileObservation: () => void;
  loadDirectLocalIntent: () => Promise<DirectLocalIntentLoader>;
  approveDirectLocalIntent: (
    intent: { label?: string },
    pendingNotice?: string,
  ) => Promise<string | undefined>;
}

export interface PostProviderApprovalResult {
  kind: "approval";
  response: string;
}

export interface PostProviderFinalResult {
  kind: "final";
  response: string;
  runFailureMessage?: string;
  observedActionCount: number;
  usedFallback: boolean;
}

export type PostProviderTurnResult =
  | PostProviderApprovalResult
  | PostProviderFinalResult;
