import { describe, expect, it } from "bun:test";
import { createElizaCloudPlugin } from "./index";

describe("createElizaCloudPlugin", () => {
  it("exposes managed cloud runtime credentials", async () => {
    const plugin = createElizaCloudPlugin({
      enabled: true,
      getStatus: () => ({
        provider: "elizacloud",
        available: true,
        reusable: true,
        nativeReady: true,
        source: ".env",
        detail: "Eliza Cloud API key is ready.",
      }),
      getCredentials: () => ({
        apiKey: "eliza_test_key",
      }),
    });

    expect(plugin.name).toBe("@elizaos/plugin-elizacloud");
    const serviceCtor = plugin.services?.[0];
    expect(serviceCtor).toBeDefined();
    const service = await (
      serviceCtor as unknown as {
        start(runtime?: unknown): Promise<{ runtimeCredentials(): unknown }>;
      }
    ).start(undefined);
    expect(service.runtimeCredentials()).toEqual(
      expect.objectContaining({
        provider: "elizacloud",
        upstreamProvider: "elizacloud",
        reusable: true,
        baseUrl: "https://www.elizacloud.ai/api/v1",
      }),
    );
  });

  it("calls the Eliza Cloud chat completions endpoint when enabled", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "cloud says hello",
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      const plugin = createElizaCloudPlugin({
        enabled: true,
        getStatus: () => ({
          provider: "elizacloud",
          available: true,
          reusable: true,
          nativeReady: true,
          detail: "ready",
        }),
        getCredentials: () => ({
          apiKey: "eliza-token",
        }),
      });
      const handler = plugin.models?.TEXT_LARGE;
      const result = await handler?.(
        {
          getSetting: (key: string) =>
            key === "runtimeSettings"
              ? JSON.stringify({
                  model: {
                    provider: "elizacloud",
                    model: "openai/gpt-5",
                    baseUrl: "https://www.elizacloud.ai/api/v1",
                  },
                })
              : null,
        } as never,
        {
          prompt: "hello",
        } as never,
      );

      expect(result).toBe("cloud says hello");
      expect(calls[0]?.url).toContain("/chat/completions");
      expect(
        (calls[0]?.init?.headers as Record<string, string>)?.Authorization,
      ).toBe("Bearer eliza-token");
      expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(
        expect.objectContaining({
          model: "openai/gpt-5",
          messages: [
            {
              role: "user",
              content: "hello",
            },
          ],
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("calls the Eliza Cloud responses endpoint for xAI Grok models", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          output_text: "grok cloud says hello",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: "grok cloud says hello",
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      const plugin = createElizaCloudPlugin({
        enabled: true,
        getStatus: () => ({
          provider: "elizacloud",
          available: true,
          reusable: true,
          nativeReady: true,
          detail: "ready",
        }),
        getCredentials: () => ({
          apiKey: "eliza-token",
        }),
      });
      const handler = plugin.models?.TEXT_LARGE;
      const result = await handler?.(
        {
          getSetting: (key: string) =>
            key === "runtimeSettings"
              ? JSON.stringify({
                  model: {
                    provider: "elizacloud",
                    model: "xai/grok-4.1-fast-reasoning",
                    baseUrl: "https://www.elizacloud.ai/api/v1",
                  },
                })
              : null,
        } as never,
        {
          prompt: "hello",
        } as never,
      );

      expect(result).toBe("grok cloud says hello");
      expect(calls[0]?.url).toContain("/responses");
      expect(
        (calls[0]?.init?.headers as Record<string, string>)?.Authorization,
      ).toBe("Bearer eliza-token");
      expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(
        expect.objectContaining({
          model: "xai/grok-4.1-fast-reasoning",
          input: [
            {
              role: "user",
              content: "hello",
            },
          ],
          max_output_tokens: 1200,
          store: false,
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("routes structured planner prompts to the fast reasoning Cloud model", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          output_text:
            '{"thought":"ok","providers":"[]","action":"respond","params":"{}","isFinish":"true"}',
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      const plugin = createElizaCloudPlugin({
        enabled: true,
        getStatus: () => ({
          provider: "elizacloud",
          available: true,
          reusable: true,
          nativeReady: true,
          detail: "ready",
        }),
        getCredentials: () => ({
          apiKey: "eliza-token",
        }),
      });
      const handler = plugin.models?.TEXT_LARGE;
      const result = await handler?.(
        {
          getSetting: (key: string) => {
            if (key === "runtimeSettings") {
              return JSON.stringify({
                model: {
                  provider: "elizacloud",
                  model: "xai/grok-4.1-fast-reasoning",
                  baseUrl: "https://www.elizacloud.ai/api/v1",
                },
              });
            }
            if (key === "ELIZAOS_CLOUD_SMALL_MODEL") {
              return "xai/grok-4.1-fast-non-reasoning";
            }
            if (key === "ELIZAOS_CLOUD_LARGE_MODEL") {
              return "xai/grok-4.1-fast-reasoning";
            }
            return null;
          },
        } as never,
        {
          prompt:
            'Return valid JSON with keys "thought", "providers", "action", "params", and "isFinish".',
        } as never,
      );

      expect(result).toContain('"isFinish":"true"');
      expect(calls[0]?.url).toContain("/responses");
      expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(
        expect.objectContaining({
          model: "xai/grok-4.1-fast-reasoning",
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("registers a native TEXT_EMBEDDING handler for cloud embeddings", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          data: [
            {
              embedding: [0.1, 0.2, 0.3],
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      const plugin = createElizaCloudPlugin({
        enabled: true,
        getStatus: () => ({
          provider: "elizacloud",
          available: true,
          reusable: true,
          nativeReady: true,
          detail: "ready",
        }),
        getCredentials: () => ({
          apiKey: "eliza-token",
        }),
      });
      const handler = plugin.models?.TEXT_EMBEDDING;
      const result = await handler?.(
        {
          getSetting: (key: string) => {
            if (key === "runtimeSettings") {
              return JSON.stringify({
                model: {
                  provider: "elizacloud",
                  baseUrl: "https://www.elizacloud.ai/api/v1",
                },
              });
            }
            if (key === "ELIZAOS_CLOUD_EMBEDDING_MODEL") {
              return "openai/text-embedding-3-small";
            }
            if (key === "ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS") {
              return "1536";
            }
            return null;
          },
        } as never,
        {
          text: "hello embeddings",
        } as never,
      );

      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(calls[0]?.url).toContain("/embeddings");
      expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(
        expect.objectContaining({
          model: "openai/text-embedding-3-small",
          input: "hello embeddings",
          encoding_format: "float",
          dimensions: 1536,
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
