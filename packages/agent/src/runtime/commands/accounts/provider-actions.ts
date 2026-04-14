import {
  activateLinkedProvider,
  connectLinkedProvider,
  formatLinkedAccountSummary,
  formatLinkedProviderAdviceAlternate,
  formatLinkedProviderAdviceNextStep,
} from "@/runtime/linked-provider-accounts";
import type { AccountsCommandContext } from "./types";

export function formatProviderActivation(
  provider: "elizacloud" | "codex" | "claude-code",
  context: AccountsCommandContext,
): string {
  const activated = activateLinkedProvider(context, provider);
  return [
    provider === "elizacloud"
      ? "Activated Eliza Cloud managed inference."
      : `Activated ${provider} as the local specialist provider.`,
    `model: ${activated.model}`,
    activated.baseUrl
      ? `baseUrl: ${activated.baseUrl}`
      : "baseUrl: provider default",
    "",
    formatLinkedAccountSummary(provider, activated.accounts),
  ].join("\n");
}

export async function formatProviderConnection(
  provider: "elizacloud" | "codex" | "claude-code",
  context: AccountsCommandContext,
): Promise<string> {
  const result = await connectLinkedProvider(context, provider);
  if (result.connected && result.activated && result.providerState) {
    return [
      provider === "elizacloud"
        ? "Eliza Cloud is now connected and active as the managed inference path."
        : `${provider} is now connected and active as a local specialist provider.`,
      `model: ${result.providerState.model}`,
      result.providerState.baseUrl
        ? `baseUrl: ${result.providerState.baseUrl}`
        : "baseUrl: provider default",
      "",
      formatLinkedAccountSummary(provider, result.accounts),
    ].join("\n");
  }

  return [
    `${provider} is not ready to activate yet.`,
    formatLinkedProviderAdviceNextStep(result.advice),
    formatLinkedProviderAdviceAlternate(result.advice) ?? "",
    `detail: ${result.advice.detail}`,
    "",
    formatLinkedAccountSummary(provider, result.accounts),
  ]
    .filter(Boolean)
    .join("\n");
}
