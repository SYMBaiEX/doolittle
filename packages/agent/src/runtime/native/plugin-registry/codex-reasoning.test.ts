import { type IAgentRuntime, ModelType, type Plugin } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  createCodexReasoningBackend,
  createDoolittleCodexReasoningPlugin,
} from "./codex-reasoning";

function runtimeFor(
  provider: string,
  reasoningEffort?: string,
  settings: Record<string, string> = {},
): IAgentRuntime {
  return {
    getSetting: (key: string) =>
      key === "runtimeSettings"
        ? JSON.stringify({ model: { provider, reasoningEffort } })
        : settings[key],
  } as unknown as IAgentRuntime;
}

function fakeCodexPlugin(handler: (...args: never[]) => unknown): Plugin {
  return {
    name: "codex-cli",
    description: "test Codex plugin",
    models: {
      [ModelType.TEXT_SMALL]: handler,
      [ModelType.RESPONSE_HANDLER]: handler,
    },
  } as Plugin;
}

const fakeAuth = {
  OPENAI_API_KEY: null,
  auth_mode: "chatgpt" as const,
  last_refresh: "",
  tokens: {
    id_token: "id-token",
    access_token: "access-token",
    refresh_token: "refresh-token",
    account_id: "account-id",
  },
};

describe("Codex reasoning compatibility backend", () => {
  it("does not invent usage observations for the untouched official fallback", async () => {
    let observed = false;
    const plugin = createDoolittleCodexReasoningPlugin(
      fakeCodexPlugin(async () => "fallback"),
      {
        observeContext: () => {
          observed = true;
        },
      },
    );
    const model = plugin.models?.[ModelType.TEXT_SMALL] as (
      runtime: IAgentRuntime,
      params: Record<string, unknown>,
    ) => Promise<unknown>;
    await expect(model(runtimeFor("codex"), { prompt: "x" })).resolves.toBe(
      "fallback",
    );
    expect(observed).toBe(false);
  });
  it("passes exact public params identity to an independent optional observer without changing old metrics", async () => {
    const runtime = runtimeFor("codex", "medium");
    const params = { prompt: "PRIVATE_OBSERVATION_CANARY" };
    const metrics: unknown[] = [];
    const contexts: unknown[][] = [];
    const plugin = createDoolittleCodexReasoningPlugin(
      fakeCodexPlugin(async () => "fallback"),
      {
        createBackend: () =>
          ({
            generate: async () => ({
              text: "complete",
              toolCalls: [],
              usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
            }),
          }) as unknown as ReturnType<typeof createCodexReasoningBackend>,
        observeUsage: (metric) => metrics.push(metric),
        observeContext: (...context) => contexts.push(context),
      },
    );
    const model = plugin.models?.[ModelType.TEXT_SMALL] as (
      runtime: IAgentRuntime,
      params: Record<string, unknown>,
    ) => Promise<unknown>;
    await expect(model(runtime, params)).resolves.toBe("complete");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.[0]).toBe(runtime);
    expect(contexts[0]?.[1]).toBe(params);
    expect(contexts[0]?.[2]).toBe(metrics[0]);
    expect(Object.keys(metrics[0] as object).sort()).toEqual(
      [
        "completed",
        "firstTextMs",
        "inputTokens",
        "outputTokens",
        "provider",
        "providerDurationMs",
        "totalTokens",
      ].sort(),
    );
    expect(JSON.stringify(metrics)).not.toContain("PRIVATE_OBSERVATION_CANARY");
  });

  it("preserves original rejection and records context when optional observers throw", async () => {
    const failure = new Error("original failure");
    let contextCalls = 0;
    const plugin = createDoolittleCodexReasoningPlugin(
      fakeCodexPlugin(async () => "fallback"),
      {
        createBackend: () =>
          ({
            generate: async () => {
              throw failure;
            },
          }) as unknown as ReturnType<typeof createCodexReasoningBackend>,
        observeUsage: () => {
          throw new Error("observer failure");
        },
        observeContext: () => {
          contextCalls++;
          throw new Error("observer failure");
        },
      },
    );
    const model = plugin.models?.[ModelType.TEXT_SMALL] as (
      runtime: IAgentRuntime,
      params: Record<string, unknown>,
    ) => Promise<unknown>;
    await expect(
      model(runtimeFor("codex", "medium"), { prompt: "x" }),
    ).rejects.toBe(failure);
    expect(contextCalls).toBe(1);
  });

  it("observes a streamed no-tools result without consuming its stream or changing output", async () => {
    let contexts = 0;
    let generates = 0;
    const params = { prompt: "x", stream: true };
    const plugin = createDoolittleCodexReasoningPlugin(
      fakeCodexPlugin(async () => "fallback"),
      {
        createBackend: () =>
          ({
            generate: async (request: {
              onTextDelta?: (chunk: string) => void;
            }) => {
              generates++;
              request.onTextDelta?.("complete");
              return {
                text: "complete",
                toolCalls: [],
                usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
              };
            },
          }) as unknown as ReturnType<typeof createCodexReasoningBackend>,
        observeContext: (_runtime, observedParams) => {
          contexts++;
          expect(observedParams).toBe(params);
        },
      },
    );
    const model = plugin.models?.[ModelType.TEXT_SMALL] as (
      runtime: IAgentRuntime,
      params: Record<string, unknown>,
    ) => Promise<{
      textStream: AsyncIterable<string>;
      text: Promise<string>;
      toolCalls?: unknown;
    }>;
    const result = await model(runtimeFor("codex", "medium"), params);
    let text = "";
    for await (const chunk of result.textStream) text += chunk;
    expect(text).toBe("complete");
    await expect(result.text).resolves.toBe("complete");
    expect(result.toolCalls).toBeUndefined();
    expect(generates).toBe(1);
    expect(contexts).toBe(1);
  });
  it("preserves real SDK image serialization with the selected effort, model and abort signal", async () => {
    const controller = new AbortController();
    const image = "data:image/png;base64,iVBORw0KGgo=";
    let requestBody: Record<string, unknown> | undefined;
    let signal: AbortSignal | null | undefined;
    const backend = createCodexReasoningBackend(runtimeFor("codex", "medium"), {
      jitterMaxMs: 0,
      loadAuth: async () => fakeAuth,
      fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        signal = init?.signal;
        return new Response("synthetic provider failure", { status: 503 });
      },
    });
    await expect(
      backend.generate({
        prompt: "Review pixels",
        model: "configured-model",
        abortSignal: controller.signal,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Review pixels" },
              { type: "image", image },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/codex \/responses returned 503/u);
    expect(signal).toBe(controller.signal);
    expect(requestBody).toMatchObject({
      model: "configured-model",
      reasoning: { effort: "medium" },
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "Review pixels" },
            { type: "input_image", image_url: image, detail: "auto" },
          ],
        },
      ],
    });
  });

  it("observes provider latency, first text, and reported tokens without changing output", async () => {
    const metrics: unknown[] = [];
    const plugin = createDoolittleCodexReasoningPlugin(
      fakeCodexPlugin(async () => "official fallback"),
      {
        createBackend: () =>
          ({
            generate: async (request: Record<string, unknown>) => {
              (request.onTextDelta as ((text: string) => void) | undefined)?.(
                "provider chunk",
              );
              return {
                text: "complete",
                toolCalls: [],
                finishReason: "stop",
                usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
              };
            },
          }) as unknown as ReturnType<typeof createCodexReasoningBackend>,
        observeUsage: (metric) => metrics.push(metric),
      },
    );
    const model = plugin.models?.[ModelType.TEXT_SMALL] as (
      runtime: IAgentRuntime,
      params: Record<string, unknown>,
    ) => Promise<unknown>;

    await expect(
      model(runtimeFor("codex", "medium"), { prompt: "private prompt" }),
    ).resolves.toBe("complete");
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      provider: "codex",
      completed: true,
      firstTextMs: expect.any(Number),
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
    });
    expect(metrics[0]).not.toHaveProperty("prompt");
    expect(metrics[0]).not.toHaveProperty("response");
  });

  it("adds the selected Codex effort to the real /responses request body", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const backend = createCodexReasoningBackend(runtimeFor("codex", "ultra"), {
      loadAuth: async () => fakeAuth,
      fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response("provider unavailable", {
          status: 503,
          statusText: "Unavailable",
        });
      },
    });

    await expect(backend.generate({ prompt: "inspect this" })).rejects.toThrow(
      /codex \/responses returned 503/u,
    );
    expect(requestBody).toMatchObject({
      model: expect.any(String),
      reasoning: { effort: "ultra" },
    });
  });

  it("does not leak a prior Codex effort after it is cleared or another provider is selected", async () => {
    for (const runtime of [runtimeFor("codex"), runtimeFor("openai", "max")]) {
      let requestBody: Record<string, unknown> | undefined;
      const backend = createCodexReasoningBackend(runtime, {
        loadAuth: async () => fakeAuth,
        fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) => {
          requestBody = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          return new Response("provider unavailable", { status: 503 });
        },
      });
      await expect(
        backend.generate({ prompt: "inspect this" }),
      ).rejects.toThrow(/codex \/responses returned 503/u);
      expect(requestBody).not.toHaveProperty("reasoning");
    }
  });

  it("preserves the caller abort signal on the outbound Codex request", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | null | undefined;
    const backend = createCodexReasoningBackend(runtimeFor("codex", "high"), {
      loadAuth: async () => fakeAuth,
      fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal;
        return new Response("provider unavailable", { status: 503 });
      },
    });

    await expect(
      backend.generate({
        prompt: "stop safely",
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow(/codex \/responses returned 503/u);
    expect(requestSignal).toBe(controller.signal);
  });

  it("matches the official runtime-derived Codex backend constructor settings", async () => {
    const runtime = runtimeFor("codex", "high", {
      CODEX_AUTH_PATH: "/tmp/codex-auth.json",
      CODEX_BASE_URL: "https://chatgpt.com/backend-api/codex-parity/",
      CODEX_MODEL: "gpt-5.4",
      CODEX_ORIGINATOR: "doolittle-test",
      CODEX_JITTER_MS_MAX: "0",
    });
    let authPath: string | undefined;
    let requestUrl: string | undefined;
    let requestOriginator: string | null | undefined;
    let requestBody: Record<string, unknown> | undefined;
    const backend = createCodexReasoningBackend(runtime, {
      loadAuth: async (path) => {
        authPath = path;
        return fakeAuth;
      },
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestOriginator = new Headers(init?.headers).get("originator");
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response("provider unavailable", { status: 503 });
      },
    });

    await expect(backend.generate({ prompt: "parity" })).rejects.toThrow(
      /codex \/responses returned 503/u,
    );
    expect(authPath).toBe("/tmp/codex-auth.json");
    expect(requestUrl).toBe(
      "https://chatgpt.com/backend-api/codex-parity/responses",
    );
    expect(requestBody).toMatchObject({ model: "gpt-5.4" });
    expect(requestOriginator).toBe("doolittle-test");
    expect((backend as unknown as { jitterMaxMs: number }).jitterMaxMs).toBe(0);
  });

  it("allows explicit backend configuration to override runtime settings", async () => {
    const backend = createCodexReasoningBackend(
      runtimeFor("codex", "high", {
        CODEX_MODEL: "gpt-5.4",
        CODEX_JITTER_MS_MAX: "200",
      }),
      { model: "gpt-5.5", jitterMaxMs: 0 },
    );

    expect((backend as unknown as { model: string }).model).toBe("gpt-5.5");
    expect((backend as unknown as { jitterMaxMs: number }).jitterMaxMs).toBe(0);
  });

  it("preserves plain, streamed, and native tool result contracts while using the compatibility backend", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const compatibilityPlugin = createDoolittleCodexReasoningPlugin(
      fakeCodexPlugin(async () => "official fallback"),
      {
        createBackend: () =>
          ({
            generate: async (request: Record<string, unknown>) => {
              requests.push(request);
              const onTextDelta = request.onTextDelta as
                | ((chunk: string) => void)
                | undefined;
              onTextDelta?.("streamed");
              return {
                text: "complete",
                toolCalls:
                  request.prompt === "tool"
                    ? [{ id: "call-1", name: "inspect", arguments: "{}" }]
                    : [],
                finishReason: "stop",
                usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
              };
            },
          }) as unknown as ReturnType<typeof createCodexReasoningBackend>,
      },
    );
    const plain = compatibilityPlugin.models?.[ModelType.TEXT_SMALL] as (
      runtime: IAgentRuntime,
      params: Record<string, unknown>,
    ) => Promise<unknown>;
    const native = compatibilityPlugin.models?.[ModelType.RESPONSE_HANDLER] as (
      runtime: IAgentRuntime,
      params: Record<string, unknown>,
    ) => Promise<unknown>;
    const controller = new AbortController();
    const legacyController = new AbortController();

    await expect(
      plain(runtimeFor("codex", "max"), { prompt: "plain" }),
    ).resolves.toBe("complete");
    const streamed = (await plain(runtimeFor("codex", "max"), {
      prompt: "stream",
      stream: true,
      signal: controller.signal,
    })) as { textStream: AsyncIterable<string>; text: Promise<string> };
    const streamedChunks: string[] = [];
    for await (const chunk of streamed.textStream) streamedChunks.push(chunk);
    expect(streamedChunks).toEqual(["streamed"]);
    await expect(streamed.text).resolves.toBe("complete");
    await expect(
      plain(runtimeFor("codex", "max"), {
        prompt: "legacy abort signal",
        abortSignal: legacyController.signal,
      }),
    ).resolves.toBe("complete");
    await expect(
      native(runtimeFor("codex", "max"), {
        prompt: "tool",
        tools: [{ name: "inspect" }],
      }),
    ).resolves.toMatchObject({
      text: "complete",
      toolCalls: [{ id: "call-1" }],
    });
    expect(requests[1]?.abortSignal).toBe(controller.signal);
    expect(requests[2]?.abortSignal).toBe(legacyController.signal);
  });

  it("propagates cancellation through streaming without unhandled sibling rejections", async () => {
    const controller = new AbortController();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const plugin = createDoolittleCodexReasoningPlugin(
        fakeCodexPlugin(async () => "official fallback"),
        {
          createBackend: () =>
            ({
              generate: (request: Record<string, unknown>) =>
                new Promise((_resolve, reject) => {
                  const signal = request.abortSignal as AbortSignal;
                  const onTextDelta = request.onTextDelta as
                    | ((chunk: string) => void)
                    | undefined;
                  onTextDelta?.("partial response");
                  signal.addEventListener(
                    "abort",
                    () => reject(new DOMException("Cancelled", "AbortError")),
                    { once: true },
                  );
                }),
            }) as unknown as ReturnType<typeof createCodexReasoningBackend>,
        },
      );
      const model = plugin.models?.[ModelType.RESPONSE_HANDLER] as (
        runtime: IAgentRuntime,
        params: Record<string, unknown>,
      ) => Promise<{
        textStream: AsyncIterable<string>;
        text: Promise<string>;
        toolCalls: Promise<unknown[]>;
        usage: Promise<unknown>;
        finishReason: Promise<unknown>;
      }>;
      const streamed = await model(runtimeFor("codex", "max"), {
        prompt: "cancel safely",
        stream: true,
        tools: [{ name: "workspace" }],
        signal: controller.signal,
      });
      const chunks: string[] = [];
      const consume = (async () => {
        for await (const chunk of streamed.textStream) chunks.push(chunk);
      })();

      controller.abort();

      await expect(consume).rejects.toMatchObject({ name: "AbortError" });
      await expect(streamed.text).rejects.toMatchObject({ name: "AbortError" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(chunks).toEqual(["partial response"]);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
