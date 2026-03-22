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
                    model: "gpt-5.4",
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
      expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(
        expect.objectContaining({
          model: "gpt-5.4",
          instructions: expect.stringContaining("You are Codex"),
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "hello",
                },
              ],
            },
          ],
          stream: true,
          store: false,
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("refreshes Codex credentials after an auth failure", async () => {
    const originalFetch = globalThis.fetch;
    let requestCount = 0;
    globalThis.fetch = (async (_url, init) => {
      requestCount += 1;
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (requestCount === 1) {
        expect(auth).toBe("Bearer stale-token");
        return new Response("expired", { status: 401 });
      }
      expect(auth).toBe("Bearer fresh-token");
      return new Response(JSON.stringify({ output_text: "refreshed" }), {
        status: 200,
      });
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
          accessToken: "stale-token",
        }),
        refreshCredentials: async () => ({
          accessToken: "fresh-token",
        }),
      });
      const handler = plugin.models?.TEXT_LARGE;
      const result = await handler?.(
        {
          getSetting: () =>
            JSON.stringify({
              model: {
                provider: "codex",
              },
            }),
        } as never,
        { prompt: "hello" } as never,
      );
      expect(result).toBe("refreshed");
      expect(requestCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("parses streamed Codex SSE output into one final answer", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        [
          "event: response.created",
          'data: {"type":"response.created","response":{"id":"resp_1"}}',
          "",
          "event: response.output_text.delta",
          'data: {"type":"response.output_text.delta","delta":"LINKED_"}',
          "",
          "event: response.output_text.delta",
          'data: {"type":"response.output_text.delta","delta":"PROVIDER_"}',
          "",
          "event: response.output_text.done",
          'data: {"type":"response.output_text.done","text":"LINKED_PROVIDER_OK"}',
          "",
          "event: response.completed",
          'data: {"type":"response.completed","response":{"output":[{"content":[{"type":"output_text","text":"LINKED_PROVIDER_OK"}]}]}}',
          "",
          "data: [DONE]",
          "",
        ].join("\n"),
        {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        },
      )) as unknown as typeof fetch;

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
      const result = await handler?.(
        {
          getSetting: () =>
            JSON.stringify({
              model: {
                provider: "codex",
              },
            }),
        } as never,
        { prompt: "hello" } as never,
      );
      expect(result).toBe("LINKED_PROVIDER_OK");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to event-stream parsing even when the content type is not labeled as SSE", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        [
          "event: response.output_text.delta",
          'data: {"type":"response.output_text.delta","delta":"LINKED_PROVIDER_OK"}',
          "",
          "data: [DONE]",
          "",
        ].join("\n"),
        {
          status: 200,
          headers: {
            "content-type": "text/plain",
          },
        },
      )) as unknown as typeof fetch;

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
      const result = await handler?.(
        {
          getSetting: () =>
            JSON.stringify({
              model: {
                provider: "codex",
              },
            }),
        } as never,
        { prompt: "hello" } as never,
      );
      expect(result).toBe("LINKED_PROVIDER_OK");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
