import { describe, expect, it } from "bun:test";
import type { IAgentRuntime } from "@elizaos/core";
import { ModelType } from "@elizaos/core";
import { ELIZA_CLOUD_EMPTY_RESPONSE_FALLBACK_MODEL } from "./constants";
import { runElizaCloudEmbeddingGeneration, runElizaCloudTextGeneration } from "./generation";

function asFetch(
  fn: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return fn as unknown as typeof fetch;
}

describe("runElizaCloudTextGeneration", () => {
  it("uses responses API and shapes request for grok models", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          output_text: "router path ok",
          output: [{ type: "message", content: [{ type: "output_text", text: "ignored" }] }],
        }),
        { status: 200 },
      );
    });

    try {
      const runtime = {
        getSetting: (key: string) =>
          key === "runtimeSettings"
            ? JSON.stringify({ model: { provider: "elizacloud", model: "xai/grok-4.1-fast-reasoning", baseUrl: "https://www.elizacloud.ai/api/v1/" } })
            : null,
      } as IAgentRuntime;

      const result = await runElizaCloudTextGeneration(
        runtime,
        { prompt: "structured prompt", maxTokens: 777 },
        { getCredentials: () => ({ apiKey: "token-abc" }), enabled: true, getStatus: () => ({ provider: "elizacloud", available: true, reusable: true, detail: "ok" }) },
        ModelType.TEXT_LARGE,
      );

      expect(result).toBe("router path ok");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toContain("/responses");
      const body = JSON.parse(String(calls[0]?.init?.body));
      expect(body).toEqual(
        expect.objectContaining({
          model: "xai/grok-4.1-fast-reasoning",
          max_output_tokens: 777,
          store: false,
          input: [{ role: "user", content: "structured prompt" }],
        }),
      );
      expect((calls[0]?.init?.headers as Record<string, string>)?.Authorization).toBe("Bearer token-abc");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retries once with fallback model when chat completion returns empty output", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async (_url, init) => {
      calls.push({ url: String(_url), body: String(init?.body) });
      const payload = JSON.parse(String(init?.body));
      if (calls.length === 1) {
        return new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
          status: 200,
        });
      }

      return new Response(JSON.stringify({ choices: [{ message: { content: "fallback output" } }] }), {
        status: 200,
      });
    });

    try {
      const runtime = {
        getSetting: (key: string) =>
          key === "runtimeSettings"
            ? JSON.stringify({ model: { provider: "elizacloud", model: "openai/gpt-5", baseUrl: "https://www.elizacloud.ai/api/v1/" } })
            : null,
      } as IAgentRuntime;

      const result = await runElizaCloudTextGeneration(
        runtime,
        { prompt: "short" },
        { getCredentials: () => ({ apiKey: "token-abc" }), enabled: true, getStatus: () => ({ provider: "elizacloud", available: true, reusable: true, detail: "ok" }) },
        ModelType.TEXT_LARGE,
      );

      expect(result).toBe("fallback output");
      expect(calls).toHaveLength(2);
      expect(JSON.parse(calls[0]?.body).model).toBe("openai/gpt-5");
      expect(JSON.parse(calls[1]?.body).model).toBe(ELIZA_CLOUD_EMPTY_RESPONSE_FALLBACK_MODEL);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when responses API returns no output text", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async () => {
      return new Response(
        JSON.stringify({ message: "ok", output: [] }),
        { status: 200 },
      );
    });

    try {
      const runtime = {
        getSetting: (key: string) =>
          key === "runtimeSettings"
            ? JSON.stringify({ model: { provider: "elizacloud", model: "xai/grok-4.1-fast-reasoning" } })
            : null,
      } as IAgentRuntime;

      const promise = runElizaCloudTextGeneration(
        runtime,
        { prompt: "missing output" },
        { getCredentials: () => ({ apiKey: "token-abc" }), enabled: true, getStatus: () => ({ provider: "elizacloud", available: true, reusable: true, detail: "ok" }) },
        ModelType.TEXT_LARGE,
      );

      await expect(promise).rejects.toThrow(
        "Eliza Cloud responses request returned no output text for xai/grok-4.1-fast-reasoning.",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("runElizaCloudEmbeddingGeneration", () => {
  it("builds embedding request body and parses vector", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({ data: [{ embedding: [0.4, 0.5, 0.6] }] }),
        { status: 200 },
      );
    });

    try {
      const runtime = {
        getSetting: (key: string) => {
          if (key === "runtimeSettings") {
            return JSON.stringify({ model: { baseUrl: "https://www.elizacloud.ai/api/v1/" } });
          }
          if (key === "ELIZAOS_CLOUD_EMBEDDING_MODEL") {
            return "openai/text-embedding-3-large";
          }
          if (key === "ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS") {
            return "2048";
          }
          return null;
        },
      } as IAgentRuntime;

      const result = await runElizaCloudEmbeddingGeneration(
        runtime,
        { text: "hello world" },
        { getCredentials: () => ({ apiKey: "embed-token" }), enabled: true, getStatus: () => ({ provider: "elizacloud", available: true, reusable: true, detail: "ok" }) },
      );

      expect(result).toEqual([0.4, 0.5, 0.6]);
      expect(calls[0]?.url).toBe("https://www.elizacloud.ai/api/v1/embeddings");
      const body = JSON.parse(String(calls[0]?.init?.body));
      expect(body).toEqual(
        expect.objectContaining({
          model: "openai/text-embedding-3-large",
          input: "hello world",
          encoding_format: "float",
          dimensions: 2048,
        }),
      );
      expect((calls[0]?.init?.headers as Record<string, string>)?.Authorization).toBe("Bearer embed-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to status credentials when embedding setting key is missing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async () => {
      return new Response(
        JSON.stringify({ data: [{ embedding: [0.1] }] }),
        { status: 200 },
      );
    });

    try {
      const runtime = {
        getSetting: (key: string) =>
          key === "runtimeSettings"
            ? JSON.stringify({ model: { baseUrl: "https://www.elizacloud.ai/api/v1/" } })
            : null,
      } as IAgentRuntime;

      await expect(
        runElizaCloudEmbeddingGeneration(runtime, { text: "fallback credential" }, {
          getCredentials: () => ({ apiKey: "status-token" }),
          enabled: true,
          getStatus: () => ({ provider: "elizacloud", available: true, reusable: true, detail: "ok" }),
        }),
      ).resolves.toEqual([0.1]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
