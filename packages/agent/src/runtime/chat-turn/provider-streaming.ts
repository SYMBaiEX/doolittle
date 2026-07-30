import type { Content, Memory } from "@elizaos/core";
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

  try {
    const envelope: unknown = JSON.parse(content.text);
    return (
      typeof envelope === "object" &&
      envelope !== null &&
      isInternalCallbackEventType((envelope as { type?: unknown }).type)
    );
  } catch {
    return false;
  }
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
  getResponse: () => string;
  setResponse: (nextResponse: string) => void;
};

export function createProviderStreamState(
  context: ProviderModelStreamingContext,
): ProviderStreamState {
  let activeStreamSource: ProviderStreamSource = "unset";
  let response = "";

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
      if (
        !chunk ||
        isInternalCallbackContent({ text: chunk } as Content) ||
        !claimStreamSource("onStreamChunk")
      ) {
        return;
      }
      await appendIncomingText(chunk);
    },
    getResponse: () => response,
    setResponse: (nextResponse: string) => {
      response = nextResponse;
    },
  };
}

export type StreamingOutputModel = ReturnType<typeof createProviderStreamState>;
