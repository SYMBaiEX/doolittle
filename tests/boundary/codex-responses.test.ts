import { expect, it, vi } from "vitest";
import { CodexResponsesBackend } from "../../packages/agent/src/runtime/native/plugin-registry/codex-responses-backend";
import { codexResponsesInput } from "../../packages/agent/src/runtime/native/plugin-registry/codex-responses-input";

const auth = {
  OPENAI_API_KEY: null,
  auth_mode: "chatgpt" as const,
  last_refresh: "2026-10-25T00:00:00Z",
  tokens: {
    id_token: "",
    access_token: "fixture-token",
    refresh_token: "fixture-refresh",
    account_id: "fixture-account",
  },
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
  "base64",
);
function response(
  output: unknown[] = [
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Verified", annotations: [] }],
    },
  ],
  completed = true,
) {
  return new Response(
    `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: "Verified" })}\n\n${completed ? `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { id: "fixture-response", object: "response", status: "completed", output, usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } } })}\n\n` : ""}`,
    { headers: { "content-type": "text/event-stream" } },
  );
}
it("uses the official Responses client for text, image, reasoning, tools and usage", async () => {
  let body: Record<string, unknown> = {};
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return response([
      {
        type: "function_call",
        call_id: "call-one",
        name: "read",
        arguments: '{"path":"sum.mjs"}',
      },
    ]);
  });
  const delta = vi.fn();
  const backend = new CodexResponsesBackend({
    jitterMaxMs: 0,
    loadAuth: async () => auth,
    fetchImpl,
    reasoningEffort: () => "medium",
  });
  const result = await backend.generate({
    prompt: "Inspect this",
    system: "Coding assistant",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Inspect this" },
          { type: "image", image: png },
        ],
      },
    ],
    tools: [{ name: "read", parameters: { type: "object", properties: {} } }],
    toolChoice: "required",
    onTextDelta: delta,
  });
  expect(body).toMatchObject({
    store: false,
    stream: true,
    instructions: "Coding assistant",
    reasoning: { effort: "medium" },
    tool_choice: "required",
  });
  expect(JSON.stringify(body.input)).toContain("data:image/png;base64,");
  expect(body.tools).toEqual([
    expect.objectContaining({ type: "function", name: "read" }),
  ]);
  expect(result.toolCalls).toEqual([
    { id: "call-one", name: "read", arguments: '{"path":"sum.mjs"}' },
  ]);
  expect(result.usage).toEqual({
    inputTokens: 5,
    outputTokens: 2,
    totalTokens: 7,
  });
  expect(delta).toHaveBeenCalledWith("Verified");
});
it("retains paired, out-of-order tool results and avoids duplicate calls", async () => {
  const input = await codexResponsesInput([
    {
      role: "assistant",
      toolCalls: [
        { id: "a", name: "read", arguments: {} },
        { id: "b", name: "read", arguments: {} },
      ],
      content: [
        { type: "tool-call", toolCallId: "a", toolName: "read", args: {} },
      ],
    },
    { role: "tool", toolCallId: "b", content: "second" },
    { role: "tool", toolCallId: "a", content: "first" },
  ]);
  expect(input).toEqual([
    { type: "function_call", call_id: "a", name: "read", arguments: "{}" },
    { type: "function_call", call_id: "b", name: "read", arguments: "{}" },
    { type: "function_call_output", call_id: "b", output: "second" },
    { type: "function_call_output", call_id: "a", output: "first" },
  ]);
});
it("refreshes an unauthorized linked token once without exposing provider bodies", async () => {
  const headers: Headers[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    headers.push(new Headers(init?.headers));
    return headers.length === 1
      ? new Response('{"error":{"message":"private-fixture-content"}}', {
          status: 401,
          headers: { "content-type": "application/json" },
        })
      : response();
  });
  const refreshAuth = vi.fn(async () => ({
    ...auth,
    tokens: { ...auth.tokens, access_token: "refreshed-fixture" },
  }));
  const result = await new CodexResponsesBackend({
    jitterMaxMs: 0,
    loadAuth: async () => auth,
    refreshAuth,
    fetchImpl,
  }).generate({ prompt: "Hello" });
  expect(result.text).toBe("Verified");
  expect(refreshAuth).toHaveBeenCalledTimes(1);
  expect(headers.map((item) => item.get("authorization"))).toEqual([
    "Bearer fixture-token",
    "Bearer refreshed-fixture",
  ]);
});
it("does not automatically retry a failed request or disclose echoed private input", async () => {
  const fetchImpl = vi.fn<typeof fetch>(
    async () =>
      new Response('{"error":{"message":"private-fixture-content"}}', {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
  );
  const backend = new CodexResponsesBackend({
    jitterMaxMs: 0,
    loadAuth: async () => auth,
    fetchImpl,
  });
  await expect(backend.generate({ prompt: "Hello" })).rejects.toThrow(
    "HTTP 403",
  );
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it("rejects incomplete streams instead of claiming success", async () => {
  const backend = new CodexResponsesBackend({
    jitterMaxMs: 0,
    loadAuth: async () => auth,
    fetchImpl: async () => response([], false),
  });
  await expect(backend.generate({ prompt: "Hello" })).rejects.toThrow(
    "did not complete",
  );
});
it("rejects invalid images and remote credential destinations before fetching", async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  const backend = new CodexResponsesBackend({
    jitterMaxMs: 0,
    loadAuth: async () => auth,
    fetchImpl,
  });
  for (const image of [
    "file:///private/secret.png",
    "data:image/png;base64,not-valid!",
    new Uint8Array([1, 2]),
  ]) {
    await expect(
      backend.generate({
        prompt: "Inspect",
        messages: [{ role: "user", content: [{ type: "image", image }] }],
      }),
    ).rejects.toThrow("Unsupported Codex image");
  }
  await expect(
    backend.generate({
      prompt: "Inspect",
      messages: [
        { role: "assistant", content: [{ type: "image", image: png }] },
      ],
    }),
  ).rejects.toThrow("user message");
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(
    () =>
      new CodexResponsesBackend({ baseUrl: "https://untrusted.example/codex" }),
  ).toThrow("base URL");
});
it("honors cancellation without dispatching a request", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetchImpl = vi.fn<typeof fetch>();
  const backend = new CodexResponsesBackend({
    jitterMaxMs: 0,
    loadAuth: async () => auth,
    fetchImpl,
  });
  await expect(
    backend.generate({ prompt: "Hello", abortSignal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("uses the modern transport for every registered Codex model even without a reasoning override", async () => {
  const { createDoolittleCodexReasoningPlugin } = await import(
    "../../packages/agent/src/runtime/native/plugin-registry/codex-reasoning"
  );
  const legacy = vi
    .fn()
    .mockRejectedValue(new Error("Legacy backend must not run"));
  const generate = vi
    .fn()
    .mockResolvedValue({ text: "Modern transport", toolCalls: [] });
  const plugin = createDoolittleCodexReasoningPlugin(
    {
      name: "codex-cli",
      description: "Fixture model provider",
      models: { TEXT_LARGE: legacy },
    },
    { createBackend: () => ({ generate }) },
  );
  const handler = plugin.models?.TEXT_LARGE;
  if (!handler) throw new Error("Codex model registration missing");
  expect(
    await handler(
      { getSetting: () => undefined } as unknown as Parameters<
        typeof handler
      >[0],
      { prompt: "Hello" },
    ),
  ).toBe("Modern transport");
  expect(generate).toHaveBeenCalledTimes(1);
  expect(legacy).not.toHaveBeenCalled();
});
it("preserves the SDK's structured tool output messages", async () => {
  const input = await codexResponsesInput([
    {
      role: "assistant",
      toolCalls: [{ id: "structured", name: "read", arguments: {} }],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "structured",
          output: { type: "text", value: "Contents" },
        },
      ],
    },
  ]);
  expect(input.at(-1)).toEqual({
    type: "function_call_output",
    call_id: "structured",
    output: "Contents",
  });
});
it("pins the credential destination at construction and refuses redirects", async () => {
  const options = {
    baseUrl: "https://chatgpt.com/backend-api/codex",
    jitterMaxMs: 0,
    loadAuth: async () => auth,
    fetchImpl: vi.fn<typeof fetch>(async () => response()),
  };
  const backend = new CodexResponsesBackend(options);
  options.baseUrl = "https://untrusted.example";
  await backend.generate({ prompt: "Hello" });
  expect(options.fetchImpl.mock.calls[0][0].toString()).toContain(
    "https://chatgpt.com/",
  );
  expect(options.fetchImpl.mock.calls[0][1]?.redirect).toBe("error");
});
