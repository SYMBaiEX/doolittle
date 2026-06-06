import type { EnvConfig } from "@doolittle/agent/plugin-api";
import type { GenerateTextParams, IAgentRuntime } from "@elizaos/core";
import { resolveModelPromptText } from "./prompt-text";
import { readRuntimeModelSettings } from "./runtime-settings";

export function hasConfiguredModelProvider(config: EnvConfig): boolean {
  return Boolean(
    config.openAiApiKey ||
      config.anthropicApiKey ||
      (config.elizaCloudEnabled && config.elizaCloudApiKey) ||
      config.ollamaApiEndpoint ||
      config.useLinkedCodexAuth ||
      config.useLinkedClaudeCodeAuth,
  );
}

export function createOpenAiBackedTextModel(config: EnvConfig) {
  return async (
    runtime: IAgentRuntime,
    params: GenerateTextParams,
  ): Promise<string> => {
    const modelSettings = readRuntimeModelSettings(runtime);
    const baseUrl = modelSettings?.baseUrl ?? config.openAiBaseUrl;
    const model = modelSettings?.model ?? config.openAiModel;
    const temperature = modelSettings?.temperature ?? config.openAiTemperature;
    const maxTokens = modelSettings?.maxTokens ?? config.openAiMaxTokens;
    const promptText = resolveModelPromptText(params);

    if (!config.openAiApiKey) {
      return [
        "Doolittle is running in offline bootstrap mode.",
        "Set OPENAI_API_KEY to enable real model-backed responses.",
        "",
        "Prompt excerpt:",
        promptText.slice(0, 600),
      ].join("\n");
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: params.maxTokens ?? maxTokens,
        messages: [
          {
            role: "user",
            content: promptText,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI-compatible request failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return (
      data.choices?.[0]?.message?.content?.trim() ?? "No response returned."
    );
  };
}
