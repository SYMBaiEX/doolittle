import type { Content } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { createProviderStreamState } from "./chat-turn/provider-streaming";

function makeStreamingState({ onProgress = true } = {}) {
  const progress: Array<{ response: string; chunk: string }> = [];
  const state = createProviderStreamState({
    resolveStreamingUpdate: (current: string, incoming: string) => {
      if (!incoming) {
        return {
          kind: "unchanged",
          emittedText: "",
          nextText: current,
        };
      }
      return {
        kind: "append",
        emittedText: incoming,
        nextText: current + incoming,
      };
    },
    extractCompatTextContent: (content) => {
      if (typeof content !== "object" || content === null) {
        return "";
      }
      return (content as { text?: string }).text ?? "";
    },
    onResponseProgress: onProgress
      ? async (update) => {
          progress.push({ response: update.response, chunk: update.chunk });
        }
      : undefined,
  });

  return { state, progress };
}

describe("chat turn provider streaming", () => {
  it("locks progress arbitration to callback source when callback emits first", async () => {
    const { state, progress } = makeStreamingState();

    await state.onCallbackContent({ text: "hello" } as Content);
    await state.onStreamChunk(" world");
    await state.onCallbackContent({ text: "!" } as Content);

    expect(state.getResponse()).toBe("hello!");
    expect(progress).toEqual([
      { response: "hello", chunk: "hello" },
      { response: "hello!", chunk: "!" },
    ]);
  });

  it("locks progress arbitration to stream chunk source when stream chunk emits first", async () => {
    const { state, progress } = makeStreamingState();

    await state.onStreamChunk("from-stream");
    await state.onCallbackContent({ text: "from-callback" } as Content);

    expect(state.getResponse()).toBe("from-stream");
    expect(progress).toEqual([
      { response: "from-stream", chunk: "from-stream" },
    ]);
  });

  it("does not surface structured internal callback envelopes as assistant text", async () => {
    const { state, progress } = makeStreamingState();
    const internalCallbacks = [
      {
        type: "tool_call",
        text: '{"type":"tool_call","toolName":"read_file"}',
      },
      {
        type: "tool_result",
        text: '{"type":"tool_result","toolName":"read_file","output":"secret"}',
      },
      {
        type: "evaluation",
        text: '{"type":"evaluation","status":"complete"}',
      },
      {
        type: "context_event",
        text: '{"type":"context_event","event":{"type":"context"}}',
      },
      {
        text: '{"type":"context","name":"workspace"}',
      },
    ] as Content[];

    for (const content of internalCallbacks) {
      await state.onCallbackContent(content);
    }
    await state.onCallbackContent({ text: "Visible reply." } as Content);

    expect(state.getResponse()).toBe("Visible reply.");
    expect(progress).toEqual([
      { response: "Visible reply.", chunk: "Visible reply." },
    ]);
  });

  it("continues to surface normal assistant callback text", async () => {
    const { state } = makeStreamingState();

    await state.onCallbackContent({
      text: "I can use a tool_call if needed.",
    } as Content);

    expect(state.getResponse()).toBe("I can use a tool_call if needed.");
  });

  it("uses the SDK action attribution argument to hide action output", async () => {
    const { state, progress } = makeStreamingState();

    await state.onCallbackContent(
      {
        text: '{"results":[{"title":"Large raw tool response"}]}',
      } as Content,
      "WEB_SEARCH",
    );
    await state.onCallbackContent({ text: "Grounded answer." } as Content);

    expect(state.getResponse()).toBe("Grounded answer.");
    expect(progress).toEqual([
      { response: "Grounded answer.", chunk: "Grounded answer." },
    ]);
  });

  it("updates and resets response without progress callback", async () => {
    const { state, progress } = makeStreamingState({ onProgress: false });

    await state.onStreamChunk("first");
    expect(state.getResponse()).toBe("first");
    state.setResponse("");
    expect(state.getResponse()).toBe("");
    expect(progress).toHaveLength(0);
  });
});
