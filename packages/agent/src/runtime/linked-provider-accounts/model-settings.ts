import type { AgentExecutionContext } from "../chat";
import {
  claudeCodeAccessTokenIsExpiring,
  getLinkedClaudeCodeCredentials,
} from "../native/account-auth";
import { resolveCloudApiBaseUrl } from "./cloud-url";
import { normalizeElizaCloudBaseUrl } from "./messages";
import type { LinkedProviderName } from "./types";

type ProviderRuntimeSettingValue = string | boolean | null;

interface ProviderRuntimeSettingsDependencies {
  claudeCodeAccessTokenIsExpiring: typeof claudeCodeAccessTokenIsExpiring;
  getLinkedClaudeCodeCredentials: typeof getLinkedClaudeCodeCredentials;
}

const providerRuntimeSettingsDependencies: ProviderRuntimeSettingsDependencies =
  {
    claudeCodeAccessTokenIsExpiring,
    getLinkedClaudeCodeCredentials,
  };

export type ProviderRuntimeSettingsContext = Pick<
  AgentExecutionContext,
  "config" | "runtime"
> & {
  services: {
    settings: Pick<AgentExecutionContext["services"]["settings"], "get">;
  };
};

export function resolveDefaultProviderModel(
  context: AgentExecutionContext,
  provider: LinkedProviderName,
): string {
  if (provider === "codex") {
    return "gpt-5.4";
  }
  if (provider === "elizacloud") {
    return context.config.elizaCloudLargeModel;
  }
  if (provider === "devin") {
    return context.config.devinModel;
  }
  return "claude-sonnet-4.6";
}

export function resolveDefaultProviderBaseUrl(
  provider: LinkedProviderName,
): string {
  if (provider === "codex") {
    return "https://chatgpt.com/backend-api/codex";
  }
  if (provider === "elizacloud") {
    return resolveCloudApiBaseUrl();
  }
  if (provider === "devin") {
    return "";
  }
  return "";
}

export function syncProviderSettings(
  context: AgentExecutionContext,
  settings: ReturnType<AgentExecutionContext["services"]["settings"]["get"]>,
): void {
  for (const [key, value] of buildProviderRuntimeSettings(context, settings)) {
    context.runtime.setSetting(key, value);
  }
}

/**
 * Produces the runtime settings a provider adapter needs for one route.
 * Callers that persist a route write these values to the runtime; model turns
 * use the same map through the request-scoped settings accessor instead.
 */
export function buildProviderRuntimeSettings(
  context: ProviderRuntimeSettingsContext,
  settings: ReturnType<
    ProviderRuntimeSettingsContext["services"]["settings"]["get"]
  >,
  dependencies: ProviderRuntimeSettingsDependencies = providerRuntimeSettingsDependencies,
): Map<string, ProviderRuntimeSettingValue> {
  const runtimeSettings = new Map<string, ProviderRuntimeSettingValue>([
    ["runtimeSettings", JSON.stringify(settings)],
  ]);

  const provider = settings.model.provider;
  const model = settings.model.model;
  const baseUrl = settings.model.baseUrl;

  runtimeSettings.set(
    "ELIZAOS_CLOUD_ENABLED",
    provider === "elizacloud" ? "true" : "false",
  );

  if (provider === "elizacloud") {
    const preservedSmallModel =
      context.runtime.getSetting("ELIZAOS_CLOUD_SMALL_MODEL") ||
      context.config.elizaCloudSmallModel;
    runtimeSettings.set(
      "ELIZAOS_CLOUD_SMALL_MODEL",
      String(preservedSmallModel),
    );
    runtimeSettings.set("ELIZAOS_CLOUD_LARGE_MODEL", model);
    runtimeSettings.set(
      "ELIZAOS_CLOUD_BASE_URL",
      normalizeElizaCloudBaseUrl(baseUrl),
    );
    return runtimeSettings;
  }

  if (provider === "anthropic" || provider === "claude-code") {
    const linkedClaude =
      provider === "claude-code"
        ? dependencies.getLinkedClaudeCodeCredentials()
        : undefined;
    const linkedClaudeReady = Boolean(
      linkedClaude?.accessToken?.trim() &&
        (!linkedClaude.expiresAt ||
          !dependencies.claudeCodeAccessTokenIsExpiring(
            linkedClaude.expiresAt,
          )),
    );
    runtimeSettings.set("ANTHROPIC_SMALL_MODEL", model);
    runtimeSettings.set("ANTHROPIC_LARGE_MODEL", model);
    runtimeSettings.set("ANTHROPIC_BASE_URL", baseUrl);
    runtimeSettings.set(
      "ANTHROPIC_AUTH_MODE",
      provider === "anthropic"
        ? "apikey"
        : linkedClaudeReady
          ? "oauth"
          : context.config.claudeCodeCliFallback
            ? "claude-cli"
            : "oauth",
    );
    return runtimeSettings;
  }

  if (provider === "devin") {
    runtimeSettings.set("DEVIN_MODEL", model);
    return runtimeSettings;
  }

  if (provider === "codex") {
    runtimeSettings.set("CODEX_MODEL", model);
    runtimeSettings.set(
      "CODEX_BASE_URL",
      "https://chatgpt.com/backend-api/codex",
    );
    return runtimeSettings;
  }

  runtimeSettings.set("OPENAI_SMALL_MODEL", model);
  runtimeSettings.set("OPENAI_LARGE_MODEL", model);
  runtimeSettings.set("OPENAI_BASE_URL", baseUrl);
  return runtimeSettings;
}
