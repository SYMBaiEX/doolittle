import { describe, expect, it } from "bun:test";
import { createCodexPlugin } from "./index";

describe("createCodexPlugin", () => {
  it("exposes linked Codex runtime credentials", async () => {
    const plugin = createCodexPlugin({
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

    expect(plugin.name).toBe("@elizaos/plugin-codex");
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
});
