import {
  type Content,
  EvaluatorService,
  type IAgentRuntime,
  type Memory,
  ModelType,
  runWithTrajectoryContext,
} from "@elizaos/core";
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
  // The post-turn evaluator output from the failed coding run arrived with
  // these JSON keys split across tokens; no token was a parseable envelope.
  const evaluatorChunks = [
    '{"',
    "fact",
    "Memory",
    '":{"',
    "ops",
    '":',
    "[]}",
    ',"',
    "relationships",
    '":{"',
    "relationships",
    '":',
    "[]}",
    "}",
  ];

  it("keeps split SDK evaluator output out of the assistant stream and fallback", async () => {
    const { state, progress } = makeStreamingState();

    await runWithTrajectoryContext({ purpose: "evaluation" }, async () => {
      for (const chunk of evaluatorChunks) {
        await state.onStreamChunk(chunk);
      }
      await state.onCallbackContent({ text: evaluatorChunks.join("") });
    });

    expect(state.getResponse()).toBe("");
    expect(progress).toEqual([]);

    // Auxiliary output must not lock out the real assistant's callback.
    await state.onCallbackContent({ text: "The implementation is blocked." });
    expect(state.getResponse()).toBe("The implementation is blocked.");
  });

  it("honors the real SDK post-turn evaluator's attribution with inherited streaming", async () => {
    const { state, progress } = makeStreamingState();
    const modelCalls: unknown[] = [];
    const runtime = {
      agentId: "agent-evaluator",
      character: { name: "Doolittle" },
      evaluators: [
        {
          name: "factMemory",
          description: "Extracts durable facts.",
          schema: { type: "object", properties: { ops: { type: "array" } } },
          shouldRun: async () => true,
          prompt: () => "Return fact operations, not assistant prose.",
        },
      ],
      emitEvent: async () => {},
      useModel: async (modelType: unknown) => {
        modelCalls.push(modelType);
        // Emulate the runtime's inherited chunk delivery. The real service
        // establishes the evaluation purpose; this test does not set it.
        for (const chunk of evaluatorChunks) {
          await state.onStreamChunk(chunk);
        }
        return evaluatorChunks.join("");
      },
    } as unknown as IAgentRuntime;
    const evaluator = new EvaluatorService(runtime);

    const result = await runWithTrajectoryContext({ purpose: "response" }, () =>
      evaluator.run({
        content: { text: "Implement the app." },
      } as Memory),
    );

    expect(modelCalls).toEqual([ModelType.TEXT_SMALL]);
    expect(result.processedEvaluators).toEqual(["factMemory"]);
    expect(state.getResponse()).toBe("");
    expect(progress).toEqual([]);
  });

  it("preserves legitimate JSON answers even with evaluator-like keys", async () => {
    const { state, progress } = makeStreamingState();

    await runWithTrajectoryContext({ purpose: "response" }, async () => {
      for (const chunk of evaluatorChunks) {
        await state.onStreamChunk(chunk);
      }
    });

    expect(state.getResponse()).toBe(evaluatorChunks.join(""));
    expect(progress.map((update) => update.chunk)).toEqual(evaluatorChunks);
  });

  it.each(["evaluation", "evaluate", "should_respond", "provider", "action"])(
    "does not append %s model output to an active assistant response",
    async (purpose) => {
      const { state, progress } = makeStreamingState();
      await state.onStreamChunk("Working");

      await runWithTrajectoryContext({ purpose }, async () => {
        await state.onStreamChunk("internal model output");
      });
      await state.onStreamChunk(" on it.");

      expect(state.getResponse()).toBe("Working on it.");
      expect(progress.map((update) => update.chunk)).toEqual([
        "Working",
        " on it.",
      ]);
    },
  );

  it("isolates concurrent evaluator and assistant stream attribution", async () => {
    const evaluation = makeStreamingState();
    const response = makeStreamingState();
    let releaseEvaluation = () => {};
    const interleaved = new Promise<void>((resolve) => {
      releaseEvaluation = resolve;
    });

    await Promise.all([
      runWithTrajectoryContext(
        { purpose: "evaluation", roomId: "room-a" },
        async () => {
          await evaluation.state.onStreamChunk(evaluatorChunks[0]);
          await interleaved;
          await evaluation.state.onStreamChunk(evaluatorChunks[1]);
        },
      ),
      runWithTrajectoryContext(
        { purpose: "response", roomId: "room-b" },
        async () => {
          await response.state.onStreamChunk("Chat B");
          releaseEvaluation();
          await Promise.resolve();
          await response.state.onStreamChunk(" stays visible.");
        },
      ),
    ]);

    expect(evaluation.state.getResponse()).toBe("");
    expect(evaluation.progress).toEqual([]);
    expect(response.state.getResponse()).toBe("Chat B stays visible.");
    expect(response.progress).toHaveLength(2);
  });

  it("keeps callback text provisional until terminal finalization", async () => {
    const { state, progress } = makeStreamingState();

    await state.onCallbackContent({ text: "hello" } as Content);
    await state.onStreamChunk(" world");
    await state.onCallbackContent({ text: "!" } as Content);

    expect(state.getResponse()).toBe("hello!");
    expect(progress).toEqual([]);
  });

  it("streams model text while keeping the accumulated response authoritative", async () => {
    const { state, progress } = makeStreamingState();

    await state.onStreamChunk("from-stream");
    await state.onCallbackContent({ text: "from-callback" } as Content);

    expect(state.getResponse()).toBe("from-stream");
    expect(progress).toEqual([
      { chunk: "from-stream", response: "from-stream" },
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
    expect(progress).toEqual([]);
  });

  it("streams incremental model chunks with a cumulative response snapshot", async () => {
    const { state, progress } = makeStreamingState();

    await state.onStreamChunk("Working");
    await state.onStreamChunk(" on it…");

    expect(progress).toEqual([
      { chunk: "Working", response: "Working" },
      { chunk: " on it…", response: "Working on it…" },
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
