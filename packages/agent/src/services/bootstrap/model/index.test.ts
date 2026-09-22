import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEnvConfig } from "@/config/env/build";
import { resolveManagedDirectories } from "@/config/env/directories";
import { parseEnv } from "@/config/env/schema";
import type { EnvConfig } from "@/types";
import { createServiceSettings } from "../settings";
import { resolveDefaultServiceModel } from "./index";

describe("resolveDefaultServiceModel", () => {
  it("defaults fresh settings to Codex even when a local inference endpoint is configured", () => {
    const defaults = resolveDefaultServiceModel({
      elizaCloudEnabled: false,
      ollamaApiEndpoint: "http://localhost:11434/api",
      ollamaLargeModel: "granite4.1:3b",
      anthropicApiKey: "",
      openAiApiKey: "",
      useLinkedClaudeCodeAuth: false,
      useLinkedCodexAuth: false,
      openAiModel: "gpt-5.4",
      openAiBaseUrl: "https://api.openai.com/v1",
      anthropicLargeModel: "claude-sonnet-4.6",
      anthropicBaseUrl: "https://api.anthropic.com",
      elizaCloudLargeModel: "xai/grok-4.1-fast-reasoning",
      elizaCloudBaseUrl: "https://www.elizacloud.ai/api/v1",
    } as EnvConfig);

    expect(defaults.provider).toBe("codex");
    expect(defaults.defaultModel).toBe("gpt-5.6-luna");
    expect(defaults.defaultReasoningEffort).toBe("medium");
    expect(defaults.defaultBaseUrl).toBe(
      "https://chatgpt.com/backend-api/codex",
    );
  });

  it("writes fresh Codex defaults and preserves a subsequently saved route on restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "doolittle-model-default-"));
    try {
      const values = parseEnv({});
      const config = buildEnvConfig(
        values,
        resolveManagedDirectories(root, values),
        {},
      );
      const defaults = resolveDefaultServiceModel(config);
      const settings = createServiceSettings(config, defaults);
      expect(settings.get().model).toMatchObject({
        provider: "codex",
        model: "gpt-5.6-luna",
        reasoningEffort: "medium",
      });
      settings.setMany([
        { path: "model.provider", value: "ollama" },
        { path: "model.model", value: "qwen3:8b" },
        { path: "model.baseUrl", value: "http://localhost:11434/api" },
        { path: "model.reasoningEffort", value: undefined },
      ]);
      expect(createServiceSettings(config, defaults).get().model).toMatchObject(
        {
          provider: "ollama",
          model: "qwen3:8b",
        },
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
