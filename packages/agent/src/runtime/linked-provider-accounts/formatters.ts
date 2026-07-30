import { displayCommand } from "@/runtime/commands/command-execution";
import { buildLinkedProviderConnectAdvice } from "@/runtime/native/account-auth/connect-advice";
import type {
  LinkedProviderAccountsSnapshot,
  LinkedProviderConnectAdvice,
  LinkedProviderName,
} from "@/runtime/native/account-auth/types";

export function formatLinkedAccountSummary(
  provider: LinkedProviderName,
  snapshot: LinkedProviderAccountsSnapshot,
): string {
  const status =
    provider === "codex"
      ? snapshot.codex
      : provider === "claude-code"
        ? snapshot.claudeCode
        : provider === "devin"
          ? snapshot.devin
          : snapshot.elizaCloud;
  return [
    `${provider}`,
    `  nativeReady: ${status.nativeReady ? "yes" : "no"}`,
    `  fallbackReady: ${status.fallbackReady ? "yes" : "no"}`,
    `  reusable: ${status.reusable ? "yes" : "no"}`,
    `  detail: ${status.detail}`,
  ].join("\n");
}

export function formatLinkedProviderAdviceNextStep(
  advice: LinkedProviderConnectAdvice,
): string {
  if (advice.primaryCommand?.startsWith("/")) {
    return `next: ${displayCommand(advice.primaryCommand)}`;
  }
  return advice.primaryCommand
    ? `next: ${advice.preferredAction} -> ${advice.primaryCommand}`
    : `next: ${advice.preferredAction}`;
}

export function formatLinkedProviderAdviceAlternate(
  advice: LinkedProviderConnectAdvice,
): string | undefined {
  if (!advice.secondaryCommand) {
    return undefined;
  }
  return advice.secondaryCommand.startsWith("/")
    ? `alternate: ${displayCommand(advice.secondaryCommand)}`
    : `alternate: ${advice.secondaryCommand}`;
}

function formatProviderModeLabel(provider: LinkedProviderName): string {
  if (provider === "elizacloud") {
    return "managed-cloud";
  }
  return "local-specialist";
}

export function formatAccountsOverview(
  activeProvider: string,
  accounts: LinkedProviderAccountsSnapshot,
): string {
  const elizaCloudAdvice = buildLinkedProviderConnectAdvice(
    "elizacloud",
    accounts.elizaCloud,
  );
  const codexAdvice = buildLinkedProviderConnectAdvice("codex", accounts.codex);
  const claudeAdvice = buildLinkedProviderConnectAdvice(
    "claude-code",
    accounts.claudeCode,
  );
  const devinAdvice = buildLinkedProviderConnectAdvice("devin", accounts.devin);

  const blocks: string[] = [
    `active-provider: ${activeProvider}`,
    "",
    "Managed path",
    `- elizacloud (${formatProviderModeLabel("elizacloud")})`,
    `  nativeReady: ${accounts.elizaCloud.nativeReady ? "yes" : "no"}`,
    `  detail: ${accounts.elizaCloud.detail}`,
    `  ${formatLinkedProviderAdviceNextStep(elizaCloudAdvice)}`,
  ];

  const elizaAlt = formatLinkedProviderAdviceAlternate(elizaCloudAdvice);
  if (elizaAlt) {
    blocks.push(`  ${elizaAlt}`);
  }

  blocks.push(
    "",
    "Local specialist providers",
    `- codex (${formatProviderModeLabel("codex")})`,
    `  nativeReady: ${accounts.codex.nativeReady ? "yes" : "no"}`,
    `  fallbackReady: ${accounts.codex.fallbackReady ? "yes" : "no"}`,
    `  detail: ${accounts.codex.detail}`,
    `  ${formatLinkedProviderAdviceNextStep(codexAdvice)}`,
  );
  const codexAlt = formatLinkedProviderAdviceAlternate(codexAdvice);
  if (codexAlt) {
    blocks.push(`  ${codexAlt}`);
  }

  blocks.push(
    `- claude-code (${formatProviderModeLabel("claude-code")})`,
    `  nativeReady: ${accounts.claudeCode.nativeReady ? "yes" : "no"}`,
    `  fallbackReady: ${accounts.claudeCode.fallbackReady ? "yes" : "no"}`,
    `  detail: ${accounts.claudeCode.detail}`,
    `  ${formatLinkedProviderAdviceNextStep(claudeAdvice)}`,
  );
  const claudeAlt = formatLinkedProviderAdviceAlternate(claudeAdvice);
  if (claudeAlt) {
    blocks.push(`  ${claudeAlt}`);
  }

  blocks.push(
    `- devin (${formatProviderModeLabel("devin")})`,
    `  nativeReady: ${accounts.devin.nativeReady ? "yes" : "no"}`,
    `  fallbackReady: ${accounts.devin.fallbackReady ? "yes" : "no"}`,
    `  detail: ${accounts.devin.detail}`,
    `  ${formatLinkedProviderAdviceNextStep(devinAdvice)}`,
  );
  const devinAlt = formatLinkedProviderAdviceAlternate(devinAdvice);
  if (devinAlt) {
    blocks.push(`  ${devinAlt}`);
  }

  return blocks.join("\n");
}
