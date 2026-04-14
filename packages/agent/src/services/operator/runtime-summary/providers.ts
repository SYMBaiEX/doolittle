import type { EnvConfig } from "@/types";
import type { LinkedAccounts, SetupProviders } from "./types";

export function buildProviderSummaries(
  config: EnvConfig,
  linkedAccounts: LinkedAccounts,
): SetupProviders {
  return [
    {
      id: "codex",
      ready: linkedAccounts.codex.nativeReady ?? linkedAccounts.codex.reusable,
      detail:
        (linkedAccounts.codex.nativeReady ?? linkedAccounts.codex.reusable)
          ? "Linked Codex account is ready for Codex-native workflows."
          : linkedAccounts.codex.available
            ? linkedAccounts.codex.detail
            : "No reusable Codex account is linked.",
    },
    {
      id: "claude-code",
      ready:
        linkedAccounts.claudeCode.nativeReady ??
        linkedAccounts.claudeCode.reusable,
      detail:
        (linkedAccounts.claudeCode.nativeReady ??
        linkedAccounts.claudeCode.reusable)
          ? "Linked Claude Code account is ready for Claude-native workflows."
          : linkedAccounts.claudeCode.fallbackReady
            ? "Claude Code local CLI fallback is available, but native Eliza auth is not fully bound yet."
            : linkedAccounts.claudeCode.available
              ? linkedAccounts.claudeCode.detail
              : "No reusable Claude Code account is linked.",
    },
    {
      id: "openai",
      ready: Boolean(config.openAiApiKey),
      detail: config.openAiApiKey
        ? `Configured for ${config.openAiModel}.`
        : (linkedAccounts.codex.nativeReady ?? linkedAccounts.codex.reusable)
          ? "No OPENAI_API_KEY is set. A linked Codex account is available for Codex-native workflows, but the OpenAI provider path still needs an API key."
          : "Missing OPENAI_API_KEY.",
    },
    {
      id: "anthropic",
      ready: Boolean(config.anthropicApiKey),
      detail: config.anthropicApiKey
        ? `Configured for ${config.anthropicLargeModel}.`
        : (linkedAccounts.claudeCode.nativeReady ??
            linkedAccounts.claudeCode.reusable)
          ? "No ANTHROPIC_API_KEY is set. Linked Claude Code credentials are available for Claude-native workflows, but the Anthropic provider path still needs an API key."
          : "Missing ANTHROPIC_API_KEY.",
    },
  ];
}
