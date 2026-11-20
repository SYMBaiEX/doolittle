import {
  describeElizaCloudDoctorState,
  formatAccountsOverview,
  formatLinkedAccountSummary,
  formatLinkedProviderAdviceAlternate,
  formatLinkedProviderAdviceNextStep,
  refreshLinkedAccounts,
} from "../../linked-provider-accounts/index";
import { buildLinkedProviderConnectAdvice } from "../../native/account-auth/index";
import { probeRuntimeProviderAccounts } from "../../native/provider-accounts";
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
      probeRuntimeProviderAccounts(context.runtime),
    );
  }

  if (trimmed === "/accounts doctor") {
    const accounts = probeRuntimeProviderAccounts(context.runtime);
    const elizaCloudAdvice = buildLinkedProviderConnectAdvice(
      "elizacloud",
      accounts.elizaCloud,
    );
    const codexAdvice = buildLinkedProviderConnectAdvice(
      "codex",
      accounts.codex,
    );
    const claudeAdvice = buildLinkedProviderConnectAdvice(
      "claude-code",
      accounts.claudeCode,
    );
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
    const snapshot = await refreshLinkedAccounts("all", context.runtime);
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
