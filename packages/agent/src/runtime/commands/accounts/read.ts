import {
  describeElizaCloudDoctorState,
  formatAccountsOverview,
  formatLinkedAccountSummary,
  formatLinkedProviderAdviceAlternate,
  formatLinkedProviderAdviceNextStep,
  refreshLinkedAccounts,
} from "@/runtime/linked-provider-accounts";
import {
  getLinkedProviderAccountsSnapshot,
  getLinkedProviderConnectAdvice,
} from "@/runtime/native/account-auth";
import type { AccountsCommandContext } from "./types";

export async function handleAccountsReadCommand(
  trimmed: string,
  context: AccountsCommandContext,
): Promise<string | undefined> {
  if (
    trimmed === "/accounts" ||
    trimmed === "/runtime accounts" ||
    trimmed === "/accounts status"
  ) {
    return formatAccountsOverview(
      context.services.settings.get().model.provider,
      getLinkedProviderAccountsSnapshot(),
    );
  }

  if (trimmed === "/accounts doctor") {
    const accounts = getLinkedProviderAccountsSnapshot();
    const elizaCloudAdvice = getLinkedProviderConnectAdvice("elizacloud");
    const codexAdvice = getLinkedProviderConnectAdvice("codex");
    const claudeAdvice = getLinkedProviderConnectAdvice("claude-code");
    const cloudDoctor = await describeElizaCloudDoctorState(context);
    return [
      "Managed cloud",
      `elizacloud: nativeReady=${accounts.elizaCloud.nativeReady ? "yes" : "no"} fallbackReady=${accounts.elizaCloud.fallbackReady ? "yes" : "no"} available=${accounts.elizaCloud.available ? "yes" : "no"}`,
      `  detail: ${accounts.elizaCloud.detail}`,
      `  cloud: baseUrl=${cloudDoctor.configuredBaseUrl}`,
      `  cloud: normalized=${cloudDoctor.normalizedBaseUrl}`,
      `  cloud: validation=${cloudDoctor.baseUrlValidation ?? "ok"}`,
      `  cloud: auth=${cloudDoctor.authMode} source=${cloudDoctor.credentialSource} apiKey=${cloudDoctor.hasApiKey ? "present" : "missing"}`,
      `  cloud: models fast=${context.config.elizaCloudSmallModel} deep=${context.config.elizaCloudLargeModel}`,
      `  cloud: embeddings model=${context.config.elizaCloudEmbeddingModel} url=${context.config.elizaCloudEmbeddingUrl ?? context.config.elizaCloudBaseUrl}`,
      `  ${formatLinkedProviderAdviceNextStep(elizaCloudAdvice)}`,
      formatLinkedProviderAdviceAlternate(elizaCloudAdvice)
        ? `  ${formatLinkedProviderAdviceAlternate(elizaCloudAdvice)}`
        : "",
      "",
      "Local specialist providers",
      `codex: nativeReady=${accounts.codex.nativeReady ? "yes" : "no"} fallbackReady=${accounts.codex.fallbackReady ? "yes" : "no"} available=${accounts.codex.available ? "yes" : "no"}`,
      `  detail: ${accounts.codex.detail}`,
      `  ${formatLinkedProviderAdviceNextStep(codexAdvice)}`,
      formatLinkedProviderAdviceAlternate(codexAdvice)
        ? `  ${formatLinkedProviderAdviceAlternate(codexAdvice)}`
        : "",
      `claude-code: nativeReady=${accounts.claudeCode.nativeReady ? "yes" : "no"} fallbackReady=${accounts.claudeCode.fallbackReady ? "yes" : "no"} available=${accounts.claudeCode.available ? "yes" : "no"}`,
      `  detail: ${accounts.claudeCode.detail}`,
      `  ${formatLinkedProviderAdviceNextStep(claudeAdvice)}`,
      formatLinkedProviderAdviceAlternate(claudeAdvice)
        ? `  ${formatLinkedProviderAdviceAlternate(claudeAdvice)}`
        : "",
    ].join("\n");
  }

  if (trimmed === "/accounts refresh") {
    const snapshot = await refreshLinkedAccounts("all");
    return [
      "Refreshed linked provider state.",
      "",
      formatLinkedAccountSummary("elizacloud", snapshot),
      "",
      formatLinkedAccountSummary("codex", snapshot),
      "",
      formatLinkedAccountSummary("claude-code", snapshot),
    ].join("\n");
  }

  return undefined;
}
