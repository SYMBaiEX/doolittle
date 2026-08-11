import { describe, expect, it, vi } from "vitest";
import { createClaudeCodePlugin } from "./index";

function runtimeSettings(model: Record<string, unknown> = {}): {
  getSetting(key: string): unknown;
} {
  return {
    getSetting: (key: string) =>
      key === "runtimeSettings"
        ? JSON.stringify({
            model: {
              provider: "claude-code",
              model: "claude-sonnet-4.6",
              ...model,
            },
          })
        : key === "ANTHROPIC_AUTH_MODE"
          ? "claude-cli"
          : undefined,
  };
}

describe("createClaudeCodePlugin", () => {
  it("exposes linked account status while keeping OAuth upstream-owned", async () => {
    const plugin = createClaudeCodePlugin({
      enabled: true,
      allowCliFallback: true,
      getStatus: () => ({
        provider: "claude-code",
        available: true,
        reusable: false,
        fallbackReady: true,
        authMode: "claude.ai",
        source: "claude status",
        accountLabel: "Operator <user@example.com>",
        detail: "Claude CLI is signed in.",
      }),
    });

    expect(plugin.name).toBe("@doolittle/plugin-claude-code");
    expect(plugin.description).toContain("fallback");
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
        fallbackReady: true,
      }),
    );
  });

  it("runs ordinary Claude CLI inference without starting a nested tool loop", async () => {
    const invokeCliPrint = vi.fn(async () => "CLAUDE_OK");
    const plugin = createClaudeCodePlugin({
      enabled: true,
      allowCliFallback: true,
      getStatus: () => ({
        provider: "claude-code",
        available: true,
        reusable: false,
        fallbackReady: true,
        detail: "ready",
      }),
      invokeCliPrint,
    });

    await expect(
      plugin.models?.TEXT_LARGE?.(
        runtimeSettings({ reasoningEffort: "high" }) as never,
        { prompt: "hello" } as never,
      ),
    ).resolves.toBe("CLAUDE_OK");
    expect(invokeCliPrint).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "hello",
        model: "sonnet",
        effort: "high",
        systemPrompt: expect.stringContaining("inference transport"),
      }),
    );
  });

  it("keeps schema-constrained response handling on the local CLI fallback", async () => {
    const invokeCliPrint = vi.fn(
      async () => '{"shouldRespond":"RESPOND","replyText":"CLAUDE_OK"}',
    );
    const plugin = createClaudeCodePlugin({
      enabled: true,
      allowCliFallback: true,
      getStatus: () => ({
        provider: "claude-code",
        available: true,
        reusable: false,
        fallbackReady: true,
        detail: "ready",
      }),
      invokeCliPrint,
    });

    await expect(
      plugin.models?.RESPONSE_HANDLER?.(
        runtimeSettings() as never,
        {
          messages: [{ role: "user", content: "Reply with CLAUDE_OK" }],
          tools: [
            {
              name: "HANDLE_RESPONSE",
              parameters: { type: "object", properties: {} },
            },
          ],
          toolChoice: "required",
        } as never,
      ),
    ).resolves.toContain("CLAUDE_OK");
    expect(invokeCliPrint).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonSchema: expect.objectContaining({ type: "object" }),
      }),
    );
  });

  it("fails closed when the explicit local fallback is disabled", async () => {
    const plugin = createClaudeCodePlugin({
      enabled: true,
      allowCliFallback: false,
      getStatus: () => ({
        provider: "claude-code",
        available: true,
        reusable: true,
        detail: "OAuth is ready through Eliza.",
      }),
    });

    await expect(
      plugin.models?.TEXT_LARGE?.(
        runtimeSettings() as never,
        { prompt: "hello" } as never,
      ),
    ).rejects.toThrow("official Eliza Anthropic plugin");
  });
});
