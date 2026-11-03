import type { GenerateTextParams, IAgentRuntime } from "@elizaos/core";
import { ModelType } from "@elizaos/core";
import { expect, it, vi } from "vitest";
import {
  createElizaTextGenerationModelHandlers,
  createProviderHttpError,
  ELIZA_TEXT_GENERATION_MODEL_TYPES,
  getRuntimeModelSettings,
  getRuntimeProvider,
  isElizaTextGenerationModelType,
  normalizeProviderTransportError,
  ProviderTransportError,
  providerErrorCodeForStatus,
  resolveModelPromptText,
} from "../../packages/plugins/provider-transport/src/index";

it("reads current runtime settings through the public transport API without caching them", () => {
  let model = { provider: "claude-code", model: "first", maxTokens: 512 };
  const getSetting = vi.fn((_key: string) => JSON.stringify({ model }));
  const runtime = { getSetting } as unknown as IAgentRuntime;
  expect(getRuntimeModelSettings(runtime)).toEqual(model);
  expect(getRuntimeProvider(runtime)).toBe("claude-code");
  model = { provider: "openai", model: "second", maxTokens: 1024 };
  expect(getRuntimeModelSettings(runtime)).toEqual(model);
  expect(
    getSetting.mock.calls.every((call) => call[0] === "runtimeSettings"),
  ).toBe(true);
});

it.each([
  undefined,
  "not JSON",
  "null",
  "{}",
  { model: { provider: "ignored" } },
])("leaves absent or unreadable runtime settings unset: %j", (value) => {
  const runtime = { getSetting: () => value } as unknown as IAgentRuntime;
  expect(getRuntimeModelSettings(runtime)).toEqual({});
  expect(getRuntimeProvider(runtime)).toBeUndefined();
});

it("keeps prompt segments ahead of the fallback prompt and messages", () => {
  const params: GenerateTextParams = {
    promptSegments: [
      { content: "Stable instructions\n", stable: true },
      { content: "Current question", stable: false },
    ],
    prompt: "Unused prompt",
    messages: [{ role: "user", content: "Unused message" }],
  };
  expect(resolveModelPromptText(params)).toBe(
    "Stable instructions\nCurrent question",
  );
  expect(resolveModelPromptText({ ...params, promptSegments: [] })).toBe(
    "Unused prompt",
  );
  expect(resolveModelPromptText({})).toBe("");
});

it("adapts multimodal messages and tool calls without sending binary attachments as prompt text", () => {
  const calls = [
    { id: "call-one", name: "lookup", arguments: { query: "local" } },
  ];
  expect(
    resolveModelPromptText({
      messages: [
        { role: "system", content: "Respond clearly." },
        {
          role: "user",
          content: [
            { type: "text", text: "Summarize" },
            { type: "image", image: "private-image-bytes" },
            {
              type: "file",
              data: "private-file-bytes",
              mediaType: "text/plain",
              filename: "notes.txt",
            },
          ],
        },
        { role: "assistant", content: null, toolCalls: calls },
        { role: "tool", content: "Found local answer." },
      ],
    }),
  ).toBe(
    [
      "system:\nRespond clearly.",
      "user:\nSummarize\n[image attachment]\n[file attachment: notes.txt]",
      `assistant:\nTool calls: ${JSON.stringify(calls)}`,
      "tool:\nFound local answer.",
    ].join("\n\n"),
  );
});

it("adds a text-only tool contract only when tool selection requests one", () => {
  const tool = {
    name: "record",
    parameters: {
      type: "object" as const,
      properties: { status: { type: "string" as const } },
    },
  };
  const params: GenerateTextParams = {
    prompt: "Record status.",
    tools: [tool],
  };
  expect(resolveModelPromptText(params)).toBe("Record status.");
  expect(resolveModelPromptText({ ...params, toolChoice: "none" })).toBe(
    "Record status.",
  );
  expect(resolveModelPromptText({ ...params, toolChoice: "required" })).toBe(
    [
      "Record status.",
      "",
      "TEXT-TRANSPORT TOOL CONTRACT:",
      "A tool response is required.",
      "Return only the JSON arguments for record; do not wrap them in a tool-call envelope or Markdown.",
      `Available tools: ${JSON.stringify([tool])}`,
    ].join("\n"),
  );
  const multiple = resolveModelPromptText({
    ...params,
    tools: [tool, { name: "inspect" }],
    toolChoice: { type: "tool", name: "inspect" },
  });
  expect(multiple).toContain('Tool choice: {"type":"tool","name":"inspect"}.');
  expect(multiple).toContain(
    'Return only JSON in the form {"toolCalls":[{"name":"TOOL_NAME","args":{...}}]}',
  );
});

it("forwards every registered text-model class and preserves runtime and params identity", async () => {
  const runtime = {} as IAgentRuntime;
  const params: GenerateTextParams = { prompt: "Fixture request" };
  const handler = vi.fn(
    async (
      _runtime: IAgentRuntime,
      _params: GenerateTextParams,
      modelType: string,
    ) => modelType,
  );
  const handlers = createElizaTextGenerationModelHandlers(handler);
  expect(Object.keys(handlers)).toEqual([...ELIZA_TEXT_GENERATION_MODEL_TYPES]);
  for (const modelType of ELIZA_TEXT_GENERATION_MODEL_TYPES) {
    expect(isElizaTextGenerationModelType(modelType)).toBe(true);
    await expect(handlers[modelType](runtime, params)).resolves.toBe(modelType);
    expect(handler).toHaveBeenLastCalledWith(runtime, params, modelType);
  }
  expect(isElizaTextGenerationModelType(ModelType.RESEARCH)).toBe(false);
  expect(isElizaTextGenerationModelType("unknown-model-class")).toBe(false);
});

it.each([
  [401, "unauthorized", false],
  [403, "unauthorized", false],
  [402, "payment_required", false],
  [408, "timeout", true],
  [504, "timeout", true],
  [429, "rate_limited", true],
  [503, "unavailable", true],
  [400, "unknown", false],
] as const)(
  "provides stable HTTP recovery metadata for status %i",
  (status, code, retryable) => {
    expect(providerErrorCodeForStatus(status)).toBe(code);
    const error = createProviderHttpError({
      provider: "fixture",
      operation: "request",
      status,
      detail: "  bounded diagnosis  ",
    });
    expect(error).toBeInstanceOf(ProviderTransportError);
    expect(error).toMatchObject({
      name: "ProviderTransportError",
      code,
      provider: "fixture",
      operation: "request",
      status,
      detail: "bounded diagnosis",
      retryable,
    });
  },
);

it("preserves structured errors and normalizes cancellation, timeout, and unknown failures", () => {
  const structured = new ProviderTransportError("Existing failure", {
    code: "no_credentials",
    provider: "fixture",
  });
  expect(
    normalizeProviderTransportError("other", "operation", structured),
  ).toBe(structured);
  const cancelled = new DOMException("Request cancelled", "AbortError");
  expect(
    normalizeProviderTransportError("fixture", "request", cancelled),
  ).toMatchObject({ code: "cancelled", retryable: false, cause: cancelled });
  const timeout = Object.assign(new Error("Deadline expired"), {
    name: "TimeoutError",
  });
  expect(
    normalizeProviderTransportError("fixture", "request", timeout),
  ).toMatchObject({ code: "timeout", retryable: true, cause: timeout });
  expect(
    normalizeProviderTransportError("fixture", "request", "unexpected status"),
  ).toMatchObject({
    code: "unknown",
    provider: "fixture",
    detail: "unexpected status",
  });
  expect(
    createProviderHttpError({
      provider: "fixture",
      operation: "request",
      status: 500,
    }).detail,
  ).toBe("empty response");
});
