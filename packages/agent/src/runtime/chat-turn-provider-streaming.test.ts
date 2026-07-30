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
  it("keeps callback text provisional until terminal finalization", async () => {
    const { state, progress } = makeStreamingState();

    await state.onCallbackContent({ text: "hello" } as Content);
    await state.onStreamChunk(" world");
    await state.onCallbackContent({ text: "!" } as Content);

    expect(state.getResponse()).toBe("hello!");
    expect(progress).toEqual([]);
  });

  it("keeps stream text provisional until terminal finalization", async () => {
    const { state, progress } = makeStreamingState();

    await state.onStreamChunk("from-stream");
    await state.onCallbackContent({ text: "from-callback" } as Content);

    expect(state.getResponse()).toBe("from-stream");
    expect(progress).toEqual([]);
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
    expect(progress).toEqual([]);
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
    expect(progress).toEqual([]);
  });

  it("suppresses structured tool events sent through the SDK stream channel", async () => {
    const { state, progress } = makeStreamingState();

    await state.onStreamChunk(
      '{"type":"tool_call","toolName":"WEB_SEARCH","arguments":{"query":"today"}}',
    );
    await state.onStreamChunk(
      '{"type":"tool_result","toolCall":{"name":"WEB_SEARCH"},"result":{"success":true,"userFacingText":"Current result","verifiedUserFacing":true}}',
    );
    await state.onStreamChunk('{"type":"evaluation","decision":"FINISH"}');

    expect(state.getResponse()).toBe("");
    expect(state.getActionResults()).toEqual([
      {
        success: true,
        userFacingText: "Current result",
        verifiedUserFacing: true,
        data: { actionName: "WEB_SEARCH" },
      },
    ]);
    expect(progress).toEqual([]);
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
