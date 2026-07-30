import {
  getLinkedProviderConnectAdvice,
  refreshLinkedClaudeCodeCredentials,
  refreshLinkedCodexCredentials,
  resolveLinkedProviderCredentials,
} from "@/runtime/native/account-auth";
import { getRuntimeProviderAccountsSnapshot } from "@/runtime/native/provider-accounts";
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

  await refreshLinkedAccounts(provider);
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
): Promise<ReturnType<typeof getRuntimeProviderAccountsSnapshot>> {
  if (!provider || provider === "all") {
    const tasks = [
      resolveProviderCredentials("elizacloud"),
      resolveProviderCredentials("codex"),
      resolveProviderCredentials("claude-code"),
      resolveProviderCredentials("devin"),
      refreshLinkedCodexCredentials().catch(() => undefined),
      refreshLinkedClaudeCodeCredentials().catch(() => undefined),
    ];
    await Promise.all(tasks);
    return getRuntimeProviderAccountsSnapshot();
  }

  if (provider === "elizacloud") {
    await resolveProviderCredentials("elizacloud");
    return getRuntimeProviderAccountsSnapshot();
  }

  if (provider === "codex") {
    await resolveProviderCredentials("codex");
    await refreshLinkedCodexCredentials();
    return getRuntimeProviderAccountsSnapshot();
  }

  if (provider === "devin") {
    await resolveProviderCredentials("devin");
    return getRuntimeProviderAccountsSnapshot();
  }

  await resolveProviderCredentials("claude-code");
  await refreshLinkedClaudeCodeCredentials();
  return getRuntimeProviderAccountsSnapshot();
}

async function resolveProviderCredentials(
  provider: LinkedProviderName,
): Promise<ReturnType<typeof resolveLinkedProviderCredentials>> {
  return resolveLinkedProviderCredentials(provider).catch(() => undefined);
}
