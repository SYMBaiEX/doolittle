import type { AppContext } from "@/runtime/bootstrap";
import {
  activateLinkedProvider,
  connectLinkedProvider,
  refreshLinkedAccounts,
} from "@/runtime/linked-provider-accounts";
import {
  buildLinkedProviderConnectAdvice,
  getLinkedProviderLoginCommand,
  getLinkedProviderSetupCommand,
  type LinkedProviderAccountsSnapshot,
} from "@/runtime/native/account-auth";
import { getRuntimeProviderAccountsSnapshot } from "@/runtime/native/provider-accounts";
import { getNativeOwnershipControlPlane } from "@/runtime/native/service-bridge/ownership";

type LinkedProvider = "elizacloud" | "codex" | "claude-code" | "devin";

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
    provider === "claude-code" ||
    provider === "devin"
    ? provider
    : undefined;
}

export function buildAccountConnectAdvice(
  accounts: LinkedProviderAccountsSnapshot,
) {
  return {
    elizaCloud: buildLinkedProviderConnectAdvice(
      "elizacloud",
      accounts.elizaCloud,
    ),
    codex: buildLinkedProviderConnectAdvice("codex", accounts.codex),
    claudeCode: buildLinkedProviderConnectAdvice(
      "claude-code",
      accounts.claudeCode,
    ),
    devin: buildLinkedProviderConnectAdvice("devin", accounts.devin),
  };
}

export async function refreshAccounts(
  context: AppContext,
  provider: LinkedProvider | "all",
) {
  return refreshLinkedAccounts(provider, context.runtime);
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

export function getAccountLoginDetails(
  context: AppContext,
  provider: LinkedProvider,
) {
  const accounts = getAccountsSnapshot(context);
  const status =
    provider === "codex"
      ? accounts.codex
      : provider === "claude-code"
        ? accounts.claudeCode
        : provider === "devin"
          ? accounts.devin
          : accounts.elizaCloud;
  return {
    provider,
    command: getLinkedProviderLoginCommand(provider),
    setupCommand: getLinkedProviderSetupCommand(provider),
    advice: buildLinkedProviderConnectAdvice(provider, status),
    accounts,
  };
}

export function getAccountsSnapshot(context: AppContext) {
  return getRuntimeProviderAccountsSnapshot(context.runtime);
}
