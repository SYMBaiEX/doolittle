import { displayCommand } from "@/runtime/commands/command-execution";
import {
  type getLinkedProviderAccountsSnapshot,
  getLinkedProviderConnectAdvice,
} from "@/runtime/native/account-auth/index";
import type { LinkedProviderName } from "./types";

export function formatLinkedAccountSummary(
  provider: LinkedProviderName,
  snapshot: ReturnType<typeof getLinkedProviderAccountsSnapshot>,
): string {
  const status =
    provider === "codex"
      ? snapshot.codex
      : provider === "claude-code"
        ? snapshot.claudeCode
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
  advice: ReturnType<typeof getLinkedProviderConnectAdvice>,
): string {
  if (advice.primaryCommand?.startsWith("/")) {
    return `next: ${displayCommand(advice.primaryCommand)}`;
  }
  return advice.primaryCommand
    ? `next: ${advice.preferredAction} -> ${advice.primaryCommand}`
    : `next: ${advice.preferredAction}`;
}

export function formatLinkedProviderAdviceAlternate(
  advice: ReturnType<typeof getLinkedProviderConnectAdvice>,
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
  accounts: ReturnType<typeof getLinkedProviderAccountsSnapshot>,
): string {
  const elizaCloudAdvice = getLinkedProviderConnectAdvice("elizacloud");
  const codexAdvice = getLinkedProviderConnectAdvice("codex");
  const claudeAdvice = getLinkedProviderConnectAdvice("claude-code");

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

  return blocks.join("\n");
}
