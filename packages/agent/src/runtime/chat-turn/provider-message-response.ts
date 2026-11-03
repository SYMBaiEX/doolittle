import type {
  ActionResult,
  Memory,
  MessageProcessingResult,
} from "@elizaos/core";
import type { AgentExecutionContext } from "../chat";

function responseText(memory: Memory | undefined): string {
  const content = memory?.content as { text?: unknown } | undefined;
  return typeof content?.text === "string" ? content.text.trim() : "";
}

export function sdkFailure(result: MessageProcessingResult | undefined) {
  if (!result || result.outcome.status === "completed") return undefined;
  if (result.outcome.status === "failed") return result.outcome.error;
  return { kind: result.outcome.status, message: result.outcome.reason };
}
export function isSdkFailureReply(
  result: MessageProcessingResult | undefined,
): boolean {
  return result !== undefined && result.outcome.status !== "completed";
}

function actionResultsFromState(state: unknown): ActionResult[] {
  if (!state || typeof state !== "object") return [];
  const data = (state as { data?: unknown }).data;
  if (!data || typeof data !== "object") return [];
  const actionResults = (data as { actionResults?: unknown }).actionResults;
  return Array.isArray(actionResults) ? (actionResults as ActionResult[]) : [];
}

function actionResultsFromMessageResult(result: unknown): ActionResult[] {
  if (!result || typeof result !== "object") return [];
  const actionResults = (result as { actionResults?: unknown }).actionResults;
  return Array.isArray(actionResults) ? (actionResults as ActionResult[]) : [];
}

/** Preserve the SDK's direct-result precedence before merging scoped receipts. */
export function providerMessageActionResults(
  result: unknown,
  settledThisAttempt: ActionResult[],
): ActionResult[] {
  const direct = actionResultsFromMessageResult(result);
  const state =
    result && typeof result === "object"
      ? actionResultsFromState((result as { state?: unknown }).state)
      : [];
  return direct.length > 0
    ? direct
    : state.length > 0
      ? state
      : settledThisAttempt;
}

/**
 * The message service can invoke callbacks for a response-handler preamble
 * before its planner executes actions. Its returned responseContent is the
 * terminal response after that loop and is the only safe user-facing answer.
 */
export type SdkResponseOrigin =
  | "current-response-content"
  | "response-message-fallback"
  | "provisional-stream-fallback"
  | "empty-after-actions"
  | "empty";

export function resolveSdkMessageResponse(input: {
  responseContent?: { text?: unknown } | null;
  responseMessages: Memory[];
  provisionalResponse: string;
  actionResults: ActionResult[];
}): { text: string; origin: SdkResponseOrigin } {
  const responseContent = input.responseContent?.text;
  if (typeof responseContent === "string" && responseContent.trim()) {
    return { text: responseContent.trim(), origin: "current-response-content" };
  }

  // A tool/action run without a canonical terminal response must not fall
  // back to responseMessages: the SDK includes response-handler early replies
  // in that collection. Post-provider will surface the normal no-response
  // notice rather than accidentally ending a turn before tool synthesis.
  if (input.actionResults.length > 0) {
    return { text: "", origin: "empty-after-actions" };
  }

  for (const message of [...input.responseMessages].reverse()) {
    const text = responseText(message);
    if (text) return { text, origin: "response-message-fallback" };
  }

  const text = input.provisionalResponse.trim();
  return { text, origin: text ? "provisional-stream-fallback" : "empty" };
}

export async function discardUnsynthesizedResponseMemories(input: {
  context: AgentExecutionContext;
  response: string;
  responseMessages: Memory[];
  runId?: string;
  sessionId: string;
  roomId: string;
}): Promise<Memory[]> {
  const rejected = input.responseMessages.filter(
    (memory) => responseText(memory) === input.response.trim(),
  );
  if (!rejected.length) return input.responseMessages;

  const deleteMemory = input.context.runtime.deleteMemory?.bind(
    input.context.runtime,
  );
  if (deleteMemory) {
    const rejectedMemoryIds = rejected.flatMap((memory) =>
      memory.id ? [memory.id] : [],
    );
    const results = await Promise.allSettled(
      rejectedMemoryIds.map((memoryId) => deleteMemory(memoryId)),
    );
    const failedDeletes = results.filter(
      (result) => result.status === "rejected",
    ).length;
    if (failedDeletes) {
      input.context.runtime.logger?.warn(
        {
          runId: input.runId,
          sessionId: input.sessionId,
          roomId: input.roomId,
          rejectedMemoryIds: rejectedMemoryIds.map(String),
          failedDeletes,
        },
        "Failed to remove every unsynthesized native response memory",
      );
    }
  }

  const rejectedMemories = new Set(rejected);
  return input.responseMessages.filter(
    (memory) => !rejectedMemories.has(memory),
  );
}
