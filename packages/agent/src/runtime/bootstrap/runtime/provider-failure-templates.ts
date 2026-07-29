import type { AgentRuntime } from "@elizaos/core";

interface ActiveModelRoute {
  provider: string;
  model?: string;
}

function providerLabel(provider: string): string {
  if (provider === "claude-code") {
    return "Claude Code";
  }
  if (provider === "codex") {
    return "Codex";
  }
  if (provider === "elizacloud") {
    return "Eliza Cloud";
  }
  if (provider === "ollama") {
    return "Ollama";
  }
  return provider || "The selected provider";
}

export function buildProviderAuthFailureReply(route: ActiveModelRoute): string {
  const label = providerLabel(route.provider);
  const model = route.model?.trim() ? ` (${route.model.trim()})` : "";

  if (route.provider === "ollama") {
    return `${label}${model} could not complete this request. Check that Ollama is running and the selected model is installed, then try again.`;
  }

  if (route.provider === "elizacloud") {
    return `${label}${model} rejected the active cloud credentials. Open Settings → Providers and reconnect Eliza Cloud, then try again.`;
  }

  return `${label}${model} rejected the active account session. Open Settings → Providers and reconnect ${label}, then try again.`;
}

export function installProviderFailureTemplates(
  runtime: AgentRuntime,
  getActiveModelRoute: () => ActiveModelRoute,
): void {
  runtime.character.templates = {
    ...runtime.character.templates,
    authFailedReply: () => buildProviderAuthFailureReply(getActiveModelRoute()),
  };
}
