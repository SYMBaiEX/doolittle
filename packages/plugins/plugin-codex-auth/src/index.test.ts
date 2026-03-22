import { describe, expect, it } from "bun:test";
import { createCodexAuthPlugin } from "./index";

describe("createCodexAuthPlugin", () => {
  it("exposes linked Codex account runtime credentials", async () => {
    const plugin = createCodexAuthPlugin({
      getStatus: () => ({
        provider: "codex",
        available: true,
        reusable: true,
        authMode: "chatgpt",
        source: "/tmp/.codex/auth.json",
        lastRefresh: "2026-03-21T12:00:00.000Z",
        detail: "Linked Codex account detected.",
      }),
    });

    expect(plugin.name).toBe("@elizaos/plugin-codex-auth");
    const serviceCtor = plugin.services?.[0];
    expect(serviceCtor).toBeDefined();
    const service = await (
      serviceCtor as unknown as {
        start(runtime?: unknown): Promise<{ runtimeCredentials(): unknown }>;
      }
    ).start(undefined);
    expect(service.runtimeCredentials()).toEqual(
      expect.objectContaining({
        provider: "openai-codex",
        reusable: true,
        baseUrl: "https://chatgpt.com/backend-api/codex",
      }),
    );
  });
});
