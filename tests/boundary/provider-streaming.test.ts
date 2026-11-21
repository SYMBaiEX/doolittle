import { resolveStreamingUpdate } from "@elizaos/shared/utils/streaming-text";
import { expect, it, vi } from "vitest";
import { createProviderStreamState } from "../../packages/agent/src/runtime/chat-turn/provider-streaming";
import { extractCompatTextContent } from "../../packages/agent/src/runtime/chat-turn/state";

it("filters internal envelopes without dropping plain text or JSON answers", async () => {
  const onResponseProgress = vi.fn();
  const stream = createProviderStreamState({
    resolveStreamingUpdate,
    extractCompatTextContent,
    onResponseProgress,
  });

  await stream.onStreamChunk('\n  {"type":"tool_call"}');
  await stream.onCallbackContent({ text: '{"type":"tool_result"}' });
  await stream.onStreamChunk("Answer: ");
  const json = '{"answer":42}';
  await stream.onStreamChunk(json);
  await stream.onCallbackContent({ text: "Duplicated callback" });

  expect(stream.getResponse()).toBe(`Answer: ${json}`);
  expect(onResponseProgress.mock.calls).toEqual([
    [{ chunk: "Answer: ", phase: "model", response: "Answer: " }],
    [{ chunk: json, phase: "model", response: `Answer: ${json}` }],
  ]);
});

it("emits each concurrent token with the response as of that token", async () => {
  const onResponseProgress = vi.fn();
  const stream = createProviderStreamState({
    resolveStreamingUpdate,
    extractCompatTextContent,
    onResponseProgress,
  });
  await Promise.all([
    stream.onStreamChunk("first"),
    stream.onStreamChunk(" second"),
  ]);
  expect(onResponseProgress.mock.calls).toEqual([
    [{ chunk: "first", phase: "model", response: "first" }],
    [{ chunk: " second", phase: "model", response: "first second" }],
  ]);
});
