import { describe, expect, it } from "bun:test";
import { createClaudeCodeAuthPlugin } from "./index";

describe("createClaudeCodeAuthPlugin", () => {
  it("exposes linked Claude Code runtime credentials", async () => {
    const plugin = createClaudeCodeAuthPlugin({
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
    });

    expect(plugin.name).toBe("@elizaos/plugin-claude-code-auth");
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
        reusable: true,
        authMode: "oauth",
      }),
    );
  });
});
