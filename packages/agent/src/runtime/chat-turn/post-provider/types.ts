import type { ActionResult, Memory } from "@elizaos/core";
import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type { ChatTurnRequest } from "@/types/runtime";
import type { TurnState } from "../state";

/**
 * Native message handling emits RUN_ENDED before Doolittle has assessed the
 * post-provider execution contract. Interactive chat runs therefore reserve
 * their terminal receipt for post-provider finalization; autonomous runs have
 * no such contract and retain the SDK lifecycle writer.
 */
export type RunTerminalWriter = "native-run-ended" | "post-provider";

export function resolveRunTerminalWriter(source: string): RunTerminalWriter {
  return source === "automation" ? "native-run-ended" : "post-provider";
}

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
  nativeResponseMessages?: Memory[];
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
