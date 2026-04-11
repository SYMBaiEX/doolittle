import { displayCommand } from "@/runtime/commands/command-execution";
import {
  activateLinkedProvider,
  connectLinkedProvider,
  describeElizaCloudDoctorState,
  formatAccountsOverview,
  formatLinkedAccountSummary,
  formatLinkedProviderAdviceAlternate,
  formatLinkedProviderAdviceNextStep,
  refreshLinkedAccounts,
  resolveLinkedProviderName,
} from "@/runtime/linked-provider-accounts";
import {
  getLinkedProviderAccountsSnapshot,
  getLinkedProviderConnectAdvice,
  getLinkedProviderLoginCommand,
  getLinkedProviderSetupCommand,
} from "@/runtime/native/account-auth/index";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "../../chat";

export async function handleAccountsCommand(
  _input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
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

  if (trimmed.startsWith("/accounts refresh ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts refresh ", "").trim(),
    );
    if (!provider) {
      return `Usage: ${displayCommand("/accounts refresh <elizacloud|codex|claude-code>")}`;
    }
    const snapshot = await refreshLinkedAccounts(provider);
    return [
      `Refreshed ${provider}.`,
      "",
      formatLinkedAccountSummary(provider, snapshot),
    ].join("\n");
  }

  if (trimmed.startsWith("/accounts use ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts use ", "").trim(),
    );
    if (!provider) {
      return `Usage: ${displayCommand("/accounts use <elizacloud|codex|claude-code>")}`;
    }
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

  if (trimmed.startsWith("/accounts connect ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts connect ", "").trim(),
    );
    if (!provider) {
      return `Usage: ${displayCommand("/accounts connect <elizacloud|codex|claude-code>")}`;
    }
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

  if (trimmed.startsWith("/accounts login ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts login ", "").trim(),
    );
    if (!provider) {
      return `Usage: ${displayCommand("/accounts login <elizacloud|codex|claude-code>")}`;
    }
    if (hooks?.runLocalShellCommand) {
      return hooks.runLocalShellCommand({
        command: getLinkedProviderLoginCommand(provider),
        afterSuccessConnectProvider: provider,
      });
    }
    const advice = getLinkedProviderConnectAdvice(provider);
    return [
      provider === "elizacloud"
        ? "To activate Eliza Cloud managed mode, run this in your local shell:"
        : `To bind ${provider} as a local specialist provider, run this in your local shell:`,
      `  ${getLinkedProviderLoginCommand(provider)}`,
      `If you're already inside the Doolittle shell or cockpit, you can also run: !${getLinkedProviderLoginCommand(provider)}`,
      getLinkedProviderSetupCommand(provider)
        ? `Optional setup-token path: ${getLinkedProviderSetupCommand(provider)}`
        : "",
      `After that, run ${displayCommand(`/accounts connect ${provider}`)} here.`,
      "",
      `detail: ${advice.detail}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (trimmed.startsWith("/accounts setup-token ")) {
    const provider = resolveLinkedProviderName(
      trimmed.replace("/accounts setup-token ", "").trim(),
    );
    if (provider !== "claude-code") {
      return `Usage: ${displayCommand("/accounts setup-token claude-code")}`;
    }
    const setupCommand = getLinkedProviderSetupCommand(provider);
    if (!setupCommand) {
      return `No setup-token flow is available for ${provider}.`;
    }
    if (hooks?.runLocalShellCommand) {
      return hooks.runLocalShellCommand({
        command: setupCommand,
        afterSuccessConnectProvider: provider,
      });
    }
    const advice = getLinkedProviderConnectAdvice(provider);
    return [
      "To bind Claude Code natively with a setup token, run this in your local shell:",
      `  ${setupCommand}`,
      `From the Doolittle shell or cockpit, you can also run: !${setupCommand}`,
      "Then paste the token into onboarding or set CLAUDE_CODE_SETUP_TOKEN / CLAUDE_CODE_OAUTH_TOKEN.",
      `After that, run ${displayCommand("/accounts connect claude-code")} here.`,
      "",
      `detail: ${advice.detail}`,
    ].join("\n");
  }

  return undefined;
}
