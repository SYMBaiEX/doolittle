import { describe, expect, it } from "bun:test";
import { createClaudeCodePlugin } from "./index";

describe("createClaudeCodePlugin", () => {
  it("exposes linked Claude Code runtime credentials", async () => {
    const plugin = createClaudeCodePlugin({
      enabled: true,
      getStatus: () => ({
        provider: "claude-code",
        available: true,
        reusable: true,
        authMode: "oauth",
        source: "/tmp/.claude/.credentials.json",
        accountLabel: "Operator <user@example.com>",
        lastRefresh: "1763579600000",
        detail: "Linked Claude Code credentials detected.",
      }),
      getCredentials: () => ({
        accessToken: "oauth-token",
      }),
    });

    expect(plugin.name).toBe("@elizaos/plugin-claude-code");
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
        provider: "claude-code",
        upstreamProvider: "anthropic",
        reusable: true,
        authMode: "oauth",
      }),
    );
  });

  it("calls the Anthropic messages endpoint with Claude Code headers when enabled", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "claude code says hello" }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      const plugin = createClaudeCodePlugin({
        enabled: true,
        getStatus: () => ({
          provider: "claude-code",
          available: true,
          reusable: true,
          authMode: "oauth",
          detail: "ready",
        }),
        getCredentials: () => ({
          accessToken: "oauth-token",
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
                    provider: "claude-code",
                    model: "claude-sonnet-4.6",
                    baseUrl: "https://api.anthropic.com",
                  },
                })
              : null,
        } as never,
        {
          prompt: "hello",
        } as never,
      );
      expect(result).toBe("claude code says hello");
      expect(calls[0]?.url).toContain("/v1/messages");
      expect(
        (calls[0]?.init?.headers as Record<string, string>)?.["anthropic-beta"],
      ).toContain("claude-code-20250219");
      expect(
        JSON.parse(String(calls[0]?.init?.body)).system?.[0]?.text,
      ).toContain("You are Claude Code");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("refreshes Claude Code credentials after an auth failure", async () => {
    const originalFetch = globalThis.fetch;
    let requestCount = 0;
    globalThis.fetch = (async (_url, init) => {
      requestCount += 1;
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (requestCount === 1) {
        expect(auth).toBe("Bearer stale-oauth");
        return new Response("expired", { status: 401 });
      }
      expect(auth).toBe("Bearer fresh-oauth");
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "refreshed claude" }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      const plugin = createClaudeCodePlugin({
        enabled: true,
        getStatus: () => ({
          provider: "claude-code",
          available: true,
          reusable: true,
          authMode: "oauth",
          detail: "ready",
        }),
        getCredentials: () => ({
          accessToken: "stale-oauth",
        }),
        refreshCredentials: async () => ({
          accessToken: "fresh-oauth",
        }),
      });
      const handler = plugin.models?.TEXT_LARGE;
      const result = await handler?.(
        {
          getSetting: () =>
            JSON.stringify({
              model: {
                provider: "claude-code",
              },
            }),
        } as never,
        { prompt: "hello" } as never,
      );
      expect(result).toBe("refreshed claude");
      expect(requestCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to the local Claude CLI when no reusable token store is readable", async () => {
    const plugin = createClaudeCodePlugin({
      enabled: true,
      allowCliFallback: true,
      getStatus: () => ({
        provider: "claude-code",
        available: true,
        reusable: true,
        authMode: "claude.ai",
        detail: "ready",
      }),
      invokeCliPrint: async ({ prompt, model, appendSystemPrompt }) => {
        expect(prompt).toBe("hello");
        expect(model).toBe("claude-sonnet-4.6");
        expect(appendSystemPrompt).toContain("You are Claude Code");
        return "LINKED_PROVIDER_OK";
      },
    });

    const handler = plugin.models?.TEXT_LARGE;
    const result = await handler?.(
      {
        getSetting: () =>
          JSON.stringify({
            model: {
              provider: "claude-code",
            },
          }),
      } as never,
      { prompt: "hello" } as never,
    );
    expect(result).toBe("LINKED_PROVIDER_OK");
  });

  it("requires native auth material when CLI fallback is disabled", async () => {
    const plugin = createClaudeCodePlugin({
      enabled: true,
      allowCliFallback: false,
      getStatus: () => ({
        provider: "claude-code",
        available: true,
        reusable: false,
        detail: "not ready",
      }),
    });

    const handler = plugin.models?.TEXT_LARGE;
    await expect(
      handler?.(
        {
          getSetting: () =>
            JSON.stringify({
              model: {
                provider: "claude-code",
              },
            }),
        } as never,
        { prompt: "hello" } as never,
      ),
    ).rejects.toThrow("No reusable Claude Code auth material");
  });
});
