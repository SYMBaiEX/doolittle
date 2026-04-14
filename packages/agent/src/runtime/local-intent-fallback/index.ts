import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import { executeDirectLocalIntent as executeDirectLocalIntentFlow } from "./execution";

export { mayNeedDirectLocalIntentInspection } from "./patterns";
export {
  isHighConfidenceDirectLocalIntent,
  requiresModelSynthesisForLocalIntent,
  shouldPreferDirectLocalExecution,
  shouldUseDirectLocalFallback,
} from "./policy";
export { resolveDirectLocalIntent } from "./resolve";

export interface DirectLocalIntentExecution {
  label: string;
  statusLine: string;
  isHighConfidence?: boolean;
  kind?: "retrieval" | "synthesis";
  execute(): Promise<string>;
}

export async function executeDirectLocalIntent(
  intent: DirectLocalIntentExecution,
  sessionId: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<string> {
  return executeDirectLocalIntentFlow(intent, sessionId, context, hooks);
}
