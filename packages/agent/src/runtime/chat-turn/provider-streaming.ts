import type { resolveStreamingUpdate } from "@elizaos/autonomous/api/streaming-text";
import type { Content, Memory } from "@elizaos/core";
import type { extractCompatTextContent } from "./state";

export type ProviderStreamSource = "unset" | "callback" | "onStreamChunk";

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
  onCallbackContent: (content: Content) => Promise<Memory[]>;
  onStreamChunk: (chunk: string) => Promise<void>;
  getResponse: () => string;
  setResponse: (nextResponse: string) => void;
};

export function createProviderStreamState(
  context: ProviderModelStreamingContext,
): ProviderStreamState {
  let activeStreamSource: ProviderStreamSource = "unset";
  let response = "";

  const emitChunk = async (chunk: string): Promise<void> => {
    if (!chunk) {
      return;
    }
    response += chunk;
    await context.onResponseProgress?.({
      chunk,
      response,
      phase: "model",
    });
  };

  const emitSnapshot = async (text: string): Promise<void> => {
    if (!text) {
      return;
    }
    response = text;
    await context.onResponseProgress?.({
      chunk: text,
      response,
      phase: "model",
    });
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
    if (update.kind === "noop") {
      return;
    }
    if (update.kind === "append") {
      await emitChunk(update.emittedText);
      return;
    }
    await emitSnapshot(update.nextText);
  };

  return {
    appendIncomingText,
    onCallbackContent: async (content: Content) => {
      const chunk = context.extractCompatTextContent(content);
      if (!chunk || !claimStreamSource("callback")) {
        return [];
      }
      await appendIncomingText(chunk);
      return [];
    },
    onStreamChunk: async (chunk: string) => {
      if (!chunk || !claimStreamSource("onStreamChunk")) {
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
