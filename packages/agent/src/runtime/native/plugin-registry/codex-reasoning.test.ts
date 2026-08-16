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
  it("adds the selected Codex effort to the real /responses request body", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const backend = createCodexReasoningBackend(runtimeFor("codex", "max"), {
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
      reasoning: { effort: "max" },
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
});
