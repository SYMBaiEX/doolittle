import type { AppContext } from "@/runtime/bootstrap";
import {
  activateLinkedProvider,
  connectLinkedProvider,
  refreshLinkedAccounts,
} from "@/runtime/linked-provider-accounts";
import {
  getLinkedProviderAccountsSnapshot,
  getLinkedProviderConnectAdvice,
  getLinkedProviderLoginCommand,
  getLinkedProviderSetupCommand,
} from "@/runtime/native/account-auth";
import { getNativeOwnershipControlPlane } from "@/runtime/native/service-bridge/ownership";

type LinkedProvider = "elizacloud" | "codex" | "claude-code";

export function resolveOwnership(context: AppContext) {
  return (
    context.services.nativeOwnership.controlPlane() ??
    getNativeOwnershipControlPlane(
      context.runtime,
      context.services,
      context.config,
      context.services.gatewayConfig,
    )
  );
}

export function readLinkedProvider(
  provider: string | undefined,
): LinkedProvider | undefined {
  return provider === "elizacloud" ||
    provider === "codex" ||
    provider === "claude-code"
    ? provider
    : undefined;
}

export function buildAccountConnectAdvice() {
  return {
    elizaCloud: getLinkedProviderConnectAdvice("elizacloud"),
    codex: getLinkedProviderConnectAdvice("codex"),
    claudeCode: getLinkedProviderConnectAdvice("claude-code"),
  };
}

export async function refreshAccounts(provider: LinkedProvider | "all") {
  return refreshLinkedAccounts(provider);
}

export function activateAccount(context: AppContext, provider: LinkedProvider) {
  return activateLinkedProvider(context, provider);
}

export async function connectAccount(
  context: AppContext,
  provider: LinkedProvider,
) {
  return connectLinkedProvider(context, provider);
}

export function getAccountLoginDetails(provider: LinkedProvider) {
  return {
    provider,
    command: getLinkedProviderLoginCommand(provider),
    setupCommand: getLinkedProviderSetupCommand(provider),
    advice: getLinkedProviderConnectAdvice(provider),
    accounts: getLinkedProviderAccountsSnapshot(),
  };
}

export function getAccountsSnapshot() {
  return getLinkedProviderAccountsSnapshot();
}
