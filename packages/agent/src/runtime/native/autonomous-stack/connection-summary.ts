import type { EnvConfig } from "../../../types/runtime/index";
import type { AutonomousConnectionSummary } from "./types";

function summarizeCloudManagedConnection(
  smallModel?: string,
  largeModel?: string,
): AutonomousConnectionSummary {
  return {
    source: "provider-switch-config",
    configured: true,
    kind: "cloud-managed",
    provider: "elizacloud",
    detail: `cloud-managed via Eliza Cloud (${smallModel ?? "small-model-unset"} / ${largeModel ?? "large-model-unset"})`,
    smallModel,
    largeModel,
  };
}

function summarizeLocalProviderConnection(
  provider: string,
  primaryModel?: string,
): AutonomousConnectionSummary {
  const providerLabel =
    {
      ollama: "Ollama",
      devin: "Devin",
      openai: "OpenAI",
      anthropic: "Anthropic",
    }[provider] ?? provider;

  return {
    source: "provider-switch-config",
    configured: true,
    kind: "local-provider",
    provider,
    detail: `local-provider via ${providerLabel}${primaryModel ? ` (${primaryModel})` : ""}`,
    primaryModel,
  };
}

function summarizeDoolittleLocalConnection(
  config: EnvConfig,
): AutonomousConnectionSummary | undefined {
  if (config.elizaCloudEnabled) {
    return undefined;
  }

  if (config.useLinkedDevinAuth) {
    return summarizeLocalProviderConnection("devin", config.devinModel);
  }

  if (config.ollamaApiEndpoint?.trim()) {
    return summarizeLocalProviderConnection("ollama", config.ollamaLargeModel);
  }

  return undefined;
}

export function summarizeAutonomousConnection(
  config?: EnvConfig,
): AutonomousConnectionSummary {
  if (!config) {
    return {
      source: "provider-switch-config",
      configured: false,
      kind: "missing",
      provider: null,
      detail:
        "No EnvConfig was supplied, so the native connection view could not be resolved.",
    };
  }

  const localConnection = summarizeDoolittleLocalConnection(config);
  if (localConnection) {
    return localConnection;
  }

  if (config.elizaCloudEnabled) {
    return summarizeCloudManagedConnection(
      config.elizaCloudSmallModel,
      config.elizaCloudLargeModel,
    );
  }

  if (config.useLinkedCodexAuth) {
    return summarizeLocalProviderConnection(
      "openai-subscription",
      config.openAiModel,
    );
  }
  if (config.useLinkedClaudeCodeAuth || config.claudeCodeCliFallback) {
    return summarizeLocalProviderConnection(
      "anthropic-subscription",
      config.anthropicLargeModel,
    );
  }
  if (config.openAiApiKey) {
    return summarizeLocalProviderConnection("configured", config.openAiModel);
  }
  if (config.anthropicApiKey) {
    return summarizeLocalProviderConnection(
      "configured",
      config.anthropicLargeModel,
    );
  }
  return {
    source: "provider-switch-config",
    configured: false,
    kind: "missing",
    provider: null,
    detail: "No native connection could be derived from the current env.",
  };
}
