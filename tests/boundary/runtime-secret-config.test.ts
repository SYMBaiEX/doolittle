import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverModelProviders } from "../../packages/agent/src/server/routes/runtime/models";
import type { EnvConfig } from "../../packages/agent/src/types/index";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runtime secret configuration boundary", () => {
  it("does not treat ambient API-key environment mutation as runtime model configuration", async () => {
    vi.stubEnv("OPENAI_API_KEY", "ambient-openai-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "ambient-anthropic-key");
    const config = {
      offlineBootstrapMode: false,
      openAiModel: "gpt-5",
      anthropicLargeModel: "claude-sonnet-4-5",
      anthropicSmallModel: "claude-haiku-4-5",
    } as EnvConfig;

    const providers = await discoverModelProviders(
      config,
      "offline",
      "offline",
      fetch,
      {},
      false,
    );

    expect(providers.find((entry) => entry.id === "openai")?.ready).toBe(false);
    expect(providers.find((entry) => entry.id === "anthropic")?.ready).toBe(
      false,
    );
  });

  it("uses explicit EnvConfig API keys for runtime model provider readiness", async () => {
    const config = {
      offlineBootstrapMode: false,
      openAiModel: "gpt-5",
      anthropicLargeModel: "claude-sonnet-4-5",
      anthropicSmallModel: "claude-haiku-4-5",
      openAiApiKey: " configured-openai-key ",
      anthropicApiKey: " configured-anthropic-key ",
    } as EnvConfig;

    const providers = await discoverModelProviders(
      config,
      "offline",
      "offline",
      fetch,
      {},
      false,
    );

    expect(providers.find((entry) => entry.id === "openai")?.ready).toBe(true);
    expect(providers.find((entry) => entry.id === "anthropic")?.ready).toBe(
      true,
    );
  });

  it("keeps runtime HTTP secret reporting on EnvConfig instead of direct env reads", () => {
    for (const file of [
      "packages/agent/src/server/routes/runtime/models.ts",
      "packages/agent/src/server/routes/runtime/status.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(
        /process\.env\.(?:OPENAI_API_KEY|ANTHROPIC_API_KEY)/u,
      );
    }
  });
});
