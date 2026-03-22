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
});
