import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import type { DirectLocalIntentExecution } from "../local-intent-fallback";

export async function executeDirectLocalIntent(
  intent: DirectLocalIntentExecution,
  sessionId: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<string> {
  await hooks?.onResponseProgress?.({
    chunk: intent.statusLine,
    response: intent.statusLine,
    phase: "command",
  });
  context.services.runController.noteActionStarted(sessionId, intent.label);
  try {
    return await intent.execute();
  } finally {
    context.services.runController.noteActionCompleted(sessionId, intent.label);
  }
}
