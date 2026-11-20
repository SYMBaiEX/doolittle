import type { EnvConfig } from "../../../types/index";
import type { LinkedAccounts, SetupProviders } from "./types";

export function buildProviderSummaries(
  config: EnvConfig,
  linkedAccounts: LinkedAccounts,
): SetupProviders {
  const { codex, claudeCode } = linkedAccounts;
  const codexReady = codex.nativeReady ?? codex.reusable;
  const claudeReady = claudeCode.nativeReady ?? claudeCode.reusable;
  return [
    {
      id: "ollama",
      ready: Boolean(config.ollamaApiEndpoint?.trim()),
      detail: config.ollamaApiEndpoint?.trim()
        ? `Local Ollama configured for ${config.ollamaLargeModel} with ${config.ollamaEmbeddingModel} embeddings.`
        : "Missing OLLAMA_API_ENDPOINT.",
    },
    {
      id: "codex",
      ready: codexReady,
      detail: codexReady
        ? "Linked Codex account is ready for Codex-native workflows."
        : codex.checked === false
          ? "Check Codex in Connections to verify account access."
          : codex.available
            ? codex.detail
            : "No reusable Codex account is linked.",
    },
    {
      id: "claude-code",
      ready: claudeReady,
      detail: claudeReady
        ? "Linked Claude Code account is ready for Claude-native workflows."
        : claudeCode.checked === false
          ? "Check Claude Code in Connections to verify account access."
          : claudeCode.fallbackReady
            ? "Claude Code local CLI fallback is available, but native Eliza auth is not fully bound yet."
            : claudeCode.available
              ? claudeCode.detail
              : "No reusable Claude Code account is linked.",
    },
    {
      id: "openai",
      ready: Boolean(config.openAiApiKey),
      detail: config.openAiApiKey
        ? `Configured for ${config.openAiModel}.`
        : codexReady
          ? "No OPENAI_API_KEY is set. A linked Codex account is available for Codex-native workflows, but the OpenAI provider path still needs an API key."
          : "Missing OPENAI_API_KEY.",
    },
    {
      id: "anthropic",
      ready: Boolean(config.anthropicApiKey),
      detail: config.anthropicApiKey
        ? `Configured for ${config.anthropicLargeModel}.`
        : claudeReady
          ? "No ANTHROPIC_API_KEY is set. Linked Claude Code credentials are available for Claude-native workflows, but the Anthropic provider path still needs an API key."
          : "Missing ANTHROPIC_API_KEY.",
    },
  ];
}
