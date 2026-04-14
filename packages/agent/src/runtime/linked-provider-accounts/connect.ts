import {
  getLinkedProviderAccountsSnapshot,
  getLinkedProviderConnectAdvice,
  refreshLinkedClaudeCodeCredentials,
  refreshLinkedCodexCredentials,
  resolveLinkedProviderCredentials,
} from "@/runtime/native/account-auth";
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
  accounts: ReturnType<typeof getLinkedProviderAccountsSnapshot>;
}> {
  const settings = context.services.settings.get();
  const fallbackAllowed =
    provider === "claude-code" ? context.config.claudeCodeCliFallback : false;

  await refreshLinkedAccounts(provider);
  const accounts = getLinkedProviderAccountsSnapshot();
  const advice = getLinkedProviderConnectAdvice(provider);
  const status =
    provider === "codex"
      ? accounts.codex
      : provider === "claude-code"
        ? accounts.claudeCode
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
): Promise<ReturnType<typeof getLinkedProviderAccountsSnapshot>> {
  if (!provider || provider === "all") {
    const tasks = [
      resolveProviderCredentials("elizacloud"),
      resolveProviderCredentials("codex"),
      resolveProviderCredentials("claude-code"),
      refreshLinkedCodexCredentials().catch(() => undefined),
      refreshLinkedClaudeCodeCredentials().catch(() => undefined),
    ];
    await Promise.all(tasks);
    return getLinkedProviderAccountsSnapshot();
  }

  if (provider === "elizacloud") {
    await resolveProviderCredentials("elizacloud");
    return getLinkedProviderAccountsSnapshot();
  }

  if (provider === "codex") {
    await resolveProviderCredentials("codex");
    await refreshLinkedCodexCredentials();
    return getLinkedProviderAccountsSnapshot();
  }

  await resolveProviderCredentials("claude-code");
  await refreshLinkedClaudeCodeCredentials();
  return getLinkedProviderAccountsSnapshot();
}

async function resolveProviderCredentials(
  provider: LinkedProviderName,
): Promise<ReturnType<typeof resolveLinkedProviderCredentials>> {
  return resolveLinkedProviderCredentials(provider).catch(() => undefined);
}
