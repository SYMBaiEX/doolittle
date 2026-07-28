import { describe, expect, it } from "vitest";
import type { EnvConfig } from "@/types";
import { resolveDefaultServiceModel } from "./index";

describe("resolveDefaultServiceModel", () => {
  it("defaults fresh local-first settings to Ollama when local inference is configured", () => {
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

    expect(defaults.provider).toBe("ollama");
    expect(defaults.defaultModel).toBe("granite4.1:3b");
    expect(defaults.defaultBaseUrl).toBe("http://localhost:11434/api");
  });
});
