import { describe, expect, it } from "bun:test";
import type { Content } from "@elizaos/core";
import { createProviderStreamState } from "./chat-turn/provider-streaming";

function makeStreamingState({ onProgress = true } = {}) {
  const progress: Array<{ response: string; chunk: string }> = [];
  const state = createProviderStreamState({
    resolveStreamingUpdate: (current: string, incoming: string) => {
      if (!incoming) {
        return {
          kind: "noop",
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

  it("updates and resets response without progress callback", async () => {
    const { state, progress } = makeStreamingState({ onProgress: false });

    await state.onStreamChunk("first");
    expect(state.getResponse()).toBe("first");
    state.setResponse("");
    expect(state.getResponse()).toBe("");
    expect(progress).toHaveLength(0);
  });
});
