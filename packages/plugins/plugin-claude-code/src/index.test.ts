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
                    model: "claude-sonnet-4-20250514",
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
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
