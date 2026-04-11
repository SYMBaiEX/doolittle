import { resolveCloudApiBaseUrl } from "@elizaos/agent/cloud/base-url";
import type { AgentExecutionContext } from "../chat";
import { normalizeElizaCloudBaseUrl } from "./messages";
import type { LinkedProviderName } from "./types";

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
  return "";
}

export function syncProviderSettings(
  context: AgentExecutionContext,
  settings: ReturnType<AgentExecutionContext["services"]["settings"]["get"]>,
): void {
  context.runtime.setSetting("runtimeSettings", JSON.stringify(settings));

  const provider = settings.model.provider;
  const model = settings.model.model;
  const baseUrl = settings.model.baseUrl;

  context.runtime.setSetting(
    "ELIZAOS_CLOUD_ENABLED",
    provider === "elizacloud" ? "true" : "false",
  );

  if (provider === "elizacloud") {
    const preservedSmallModel =
      context.runtime.getSetting("ELIZAOS_CLOUD_SMALL_MODEL") ||
      context.config.elizaCloudSmallModel;
    context.runtime.setSetting(
      "ELIZAOS_CLOUD_SMALL_MODEL",
      String(preservedSmallModel),
    );
    context.runtime.setSetting("ELIZAOS_CLOUD_LARGE_MODEL", model);
    context.runtime.setSetting(
      "ELIZAOS_CLOUD_BASE_URL",
      normalizeElizaCloudBaseUrl(baseUrl),
    );
    return;
  }

  if (provider === "anthropic" || provider === "claude-code") {
    context.runtime.setSetting("ANTHROPIC_SMALL_MODEL", model);
    context.runtime.setSetting("ANTHROPIC_LARGE_MODEL", model);
    context.runtime.setSetting("ANTHROPIC_BASE_URL", baseUrl);
    return;
  }

  context.runtime.setSetting("OPENAI_SMALL_MODEL", model);
  context.runtime.setSetting("OPENAI_LARGE_MODEL", model);
  context.runtime.setSetting(
    "OPENAI_BASE_URL",
    provider === "codex" ? "https://chatgpt.com/backend-api/codex" : baseUrl,
  );
}
