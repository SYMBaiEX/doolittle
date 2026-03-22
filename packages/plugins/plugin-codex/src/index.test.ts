import { describe, expect, it } from "bun:test";
import { createCodexPlugin } from "./index";

describe("createCodexPlugin", () => {
  it("exposes linked Codex runtime credentials", async () => {
    const plugin = createCodexPlugin({
      enabled: true,
      getStatus: () => ({
        provider: "codex",
        available: true,
        reusable: true,
        authMode: "chatgpt",
        source: "/tmp/.codex/auth.json",
        lastRefresh: "2026-03-21T12:00:00.000Z",
        detail: "Linked Codex account detected.",
      }),
      getCredentials: () => ({
        accessToken: "token",
      }),
    });

    expect(plugin.name).toBe("@elizaos/plugin-codex");
    expect(plugin.models).toBeDefined();
    const serviceCtor = plugin.services?.[0];
    expect(serviceCtor).toBeDefined();
    const service = await (
      serviceCtor as unknown as {
        start(runtime?: unknown): Promise<{ runtimeCredentials(): unknown }>;
      }
    ).start(undefined);
    expect(service.runtimeCredentials()).toEqual(
      expect.objectContaining({
        provider: "codex",
        upstreamProvider: "openai-codex",
        reusable: true,
        baseUrl: "https://chatgpt.com/backend-api/codex",
      }),
    );
  });

  it("calls the Codex responses endpoint when enabled", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          output_text: "codex says hello",
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      const plugin = createCodexPlugin({
        enabled: true,
        getStatus: () => ({
          provider: "codex",
          available: true,
          reusable: true,
          detail: "ready",
        }),
        getCredentials: () => ({
          accessToken: "codex-token",
        }),
      });
      const handler = plugin.models?.TEXT_LARGE;
      expect(handler).toBeDefined();
      const result = await handler?.(
        {
          getSetting: (key: string) =>
            key === "runtimeSettings"
              ? JSON.stringify({
                  model: {
                    provider: "codex",
                    model: "gpt-5.3-codex",
                    baseUrl: "https://chatgpt.com/backend-api/codex",
                  },
                })
              : null,
        } as never,
        {
          prompt: "hello",
        } as never,
      );
      expect(result).toBe("codex says hello");
      expect(calls[0]?.url).toContain("/responses");
      expect(
        (calls[0]?.init?.headers as Record<string, string>)?.Authorization,
      ).toBe("Bearer codex-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
