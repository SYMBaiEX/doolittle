import {
  getLinkedProviderConnectAdvice,
  refreshLinkedClaudeCodeCredentials,
  refreshLinkedCodexCredentials,
  resolveLinkedProviderCredentials,
} from "@/runtime/native/account-auth";
import {
  getRuntimeProviderAccountsSnapshot,
  refreshRuntimeProviderAccount,
} from "@/runtime/native/provider-accounts";
import type { AgentExecutionContext } from "../chat";
import { activateLinkedProvider } from "./activation";
import type { LinkedProviderName } from "./types";

export async function connectLinkedProvider(
  context: AgentExecutionContext,
  provider: LinkedProviderName,
): Promise<{
  provider: LinkedProviderName;
  connected: boolean;
  activated: boolean;
  providerState?: ReturnType<typeof activateLinkedProvider>;
  advice: ReturnType<typeof getLinkedProviderConnectAdvice>;
  accounts: ReturnType<typeof getRuntimeProviderAccountsSnapshot>;
}> {
  const settings = context.services.settings.get();
  const fallbackAllowed =
    provider === "claude-code" ? context.config.claudeCodeCliFallback : false;

  await refreshLinkedAccounts(provider, context.runtime);
  const accounts = getRuntimeProviderAccountsSnapshot(context.runtime);
  const advice = getLinkedProviderConnectAdvice(provider);
  const status =
    provider === "codex"
      ? accounts.codex
      : provider === "claude-code"
        ? accounts.claudeCode
        : provider === "devin"
          ? accounts.devin
          : accounts.elizaCloud;
  const nativeReady = status.nativeReady ?? status.reusable;
  const fallbackReady = status.fallbackReady ?? false;
  const canActivate =
    nativeReady ||
    (provider === "claude-code" && fallbackAllowed && fallbackReady);

  if (!canActivate) {
    return {
      provider,
      connected: false,
      activated: false,
      advice,
      accounts,
    };
  }

  const providerState = activateLinkedProvider(context, provider);
  return {
    provider,
    connected: true,
    activated: settings.model.provider !== provider || canActivate,
    providerState,
    advice,
    accounts: providerState.accounts,
  };
}

export async function refreshLinkedAccounts(
  provider?: LinkedProviderName | "all",
  runtime?: AgentExecutionContext["runtime"],
): Promise<ReturnType<typeof getRuntimeProviderAccountsSnapshot>> {
  if (!provider || provider === "all") {
    await Promise.all(
      (
        ["elizacloud", "codex", "claude-code", "devin"] as LinkedProviderName[]
      ).map((providerName) =>
        refreshProviderAccount(providerName, runtime).catch(() => undefined),
      ),
    );
    return getRuntimeProviderAccountsSnapshot(runtime);
  }

  await refreshProviderAccount(provider, runtime);
  return getRuntimeProviderAccountsSnapshot(runtime);
}

async function refreshProviderAccount(
  provider: LinkedProviderName,
  runtime?: AgentExecutionContext["runtime"],
): Promise<void> {
  if (await refreshRuntimeProviderAccount(runtime, provider)) return;
  await resolveProviderCredentials(provider);
  if (provider === "codex") {
    await refreshLinkedCodexCredentials();
  } else if (provider === "claude-code") {
    await refreshLinkedClaudeCodeCredentials();
  }
}

async function resolveProviderCredentials(
  provider: LinkedProviderName,
): Promise<ReturnType<typeof resolveLinkedProviderCredentials>> {
  return resolveLinkedProviderCredentials(provider).catch(() => undefined);
}
