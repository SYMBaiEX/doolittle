import type { ActionResult, Content, Memory } from "@elizaos/core";
import type { resolveStreamingUpdate } from "@elizaos/shared/utils/streaming-text";
import type { extractCompatTextContent } from "./state";

export type ProviderStreamSource = "unset" | "callback" | "onStreamChunk";

const INTERNAL_CALLBACK_EVENT_TYPES = new Set([
  "tool_call",
  "tool_result",
  "tool_error",
  "evaluation",
  "context",
  "context_event",
]);

function isInternalCallbackEventType(value: unknown): boolean {
  return typeof value === "string" && INTERNAL_CALLBACK_EVENT_TYPES.has(value);
}

function parseInternalCallbackEnvelope(
  text: string,
): Record<string, unknown> | null {
  try {
    const envelope: unknown = JSON.parse(text);
    return typeof envelope === "object" &&
      envelope !== null &&
      !Array.isArray(envelope)
      ? (envelope as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function actionResultFromEnvelope(
  envelope: Record<string, unknown> | null,
): ActionResult | null {
  if (envelope?.type !== "tool_result") return null;
  const result = envelope.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  const record = result as Record<string, unknown>;
  if (typeof record.success !== "boolean") return null;
  const toolCall =
    envelope.toolCall &&
    typeof envelope.toolCall === "object" &&
    !Array.isArray(envelope.toolCall)
      ? (envelope.toolCall as Record<string, unknown>)
      : null;
  const actionName =
    typeof toolCall?.name === "string" ? toolCall.name : undefined;
  const data =
    record.data &&
    typeof record.data === "object" &&
    !Array.isArray(record.data)
      ? ({ ...(record.data as Record<string, unknown>) } as NonNullable<
          ActionResult["data"]
        >)
      : ({} as NonNullable<ActionResult["data"]>);
  if (actionName && typeof data.actionName !== "string") {
    data.actionName = actionName;
  }
  return {
    ...(record as unknown as ActionResult),
    success: record.success,
    data,
  };
}

function isInternalCallbackContent(
  content: Content,
  actionName?: string,
): boolean {
  if (actionName?.trim()) {
    return true;
  }

  if (isInternalCallbackEventType(content.type)) {
    return true;
  }

  if (typeof content.text !== "string") {
    return false;
  }

  const envelope = parseInternalCallbackEnvelope(content.text);
  return isInternalCallbackEventType(envelope?.type);
}

export type ProviderModelResponseProgress = {
  chunk: string;
  response: string;
  phase: "model";
};

export type ProviderStreamProgressHandler = (
  update: ProviderModelResponseProgress,
) => void | Promise<void>;

export type ProviderModelStreamingContext = {
  resolveStreamingUpdate: typeof resolveStreamingUpdate;
  extractCompatTextContent: typeof extractCompatTextContent;
  onResponseProgress?: ProviderStreamProgressHandler;
};

export type ProviderStreamState = {
  appendIncomingText: (incoming: string) => Promise<void>;
  onCallbackContent: (
    content: Content,
    actionName?: string,
  ) => Promise<Memory[]>;
  onStreamChunk: (chunk: string) => Promise<void>;
  getActionResults: () => ActionResult[];
  getResponse: () => string;
  setResponse: (nextResponse: string) => void;
};

export function createProviderStreamState(
  context: ProviderModelStreamingContext,
): ProviderStreamState {
  let activeStreamSource: ProviderStreamSource = "unset";
  let response = "";
  const actionResults: ActionResult[] = [];

  /**
   * The Eliza message service may emit a response-handler acknowledgement
   * before it enters the planner/action loop. Keep that text available as a
   * compatibility fallback, but never deliver it to the client: a later tool
   * call can make it stale or explicitly supersede it with the final planner
   * response. The terminal delivery happens in post-provider/finalize.ts.
   */
  const appendProvisionalText = async (chunk: string): Promise<void> => {
    if (!chunk) {
      return;
    }
    response += chunk;
  };

  const replaceProvisionalText = async (text: string): Promise<void> => {
    if (!text) {
      return;
    }
    response = text;
  };

  const claimStreamSource = (
    source: Exclude<ProviderStreamSource, "unset">,
  ) => {
    if (activeStreamSource === "unset") {
      activeStreamSource = source;
      return true;
    }
    return activeStreamSource === source;
  };

  const appendIncomingText = async (incoming: string): Promise<void> => {
    const update = context.resolveStreamingUpdate(response, incoming);
    if (update.kind === "unchanged") {
      return;
    }
    if (update.kind === "append") {
      await appendProvisionalText(update.emittedText);
      return;
    }
    await replaceProvisionalText(update.nextText);
  };

  return {
    appendIncomingText,
    onCallbackContent: async (content: Content, actionName?: string) => {
      if (isInternalCallbackContent(content, actionName)) {
        return [];
      }
      const chunk = context.extractCompatTextContent(content);
      if (!chunk || !claimStreamSource("callback")) {
        return [];
      }
      await appendIncomingText(chunk);
      return [];
    },
    onStreamChunk: async (chunk: string) => {
      // The SDK serializes tool calls, tool results, and evaluator updates
      // through onStreamChunk. They are run telemetry, not assistant prose.
      const envelope = chunk ? parseInternalCallbackEnvelope(chunk) : null;
      const actionResult = actionResultFromEnvelope(envelope);
      if (actionResult) {
        actionResults.push(actionResult);
      }
      if (
        !chunk ||
        isInternalCallbackEventType(envelope?.type) ||
        !claimStreamSource("onStreamChunk")
      ) {
        return;
      }
      await appendIncomingText(chunk);
    },
    getActionResults: () => [...actionResults],
    getResponse: () => response,
    setResponse: (nextResponse: string) => {
      response = nextResponse;
    },
  };
}

export type StreamingOutputModel = ReturnType<typeof createProviderStreamState>;
