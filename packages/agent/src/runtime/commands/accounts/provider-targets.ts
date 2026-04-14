import { displayCommand } from "@/runtime/commands/command-execution";
import {
  formatLinkedAccountSummary,
  refreshLinkedAccounts,
} from "@/runtime/linked-provider-accounts";
import { handleAccountLogin, handleClaudeSetupToken } from "./local-shell";
import {
  formatProviderActivation,
  formatProviderConnection,
} from "./provider-actions";
import { invalidProviderUsage, resolveProviderArgument } from "./shared";
import type { AccountsCommandContext, AccountsCommandHooks } from "./types";

export async function handleAccountsProviderCommand(
  trimmed: string,
  context: AccountsCommandContext,
  hooks: AccountsCommandHooks,
): Promise<string | undefined> {
  if (trimmed.startsWith("/accounts refresh ")) {
    const provider = resolveProviderArgument(trimmed, "/accounts refresh ");
    if (!provider) {
      return invalidProviderUsage(
        "/accounts refresh <elizacloud|codex|claude-code>",
      );
    }
    const snapshot = await refreshLinkedAccounts(provider);
    return [
      `Refreshed ${provider}.`,
      "",
      formatLinkedAccountSummary(provider, snapshot),
    ].join("\n");
  }

  if (trimmed.startsWith("/accounts use ")) {
    const provider = resolveProviderArgument(trimmed, "/accounts use ");
    if (!provider) {
      return invalidProviderUsage(
        "/accounts use <elizacloud|codex|claude-code>",
      );
    }
    return formatProviderActivation(provider, context);
  }

  if (trimmed.startsWith("/accounts connect ")) {
    const provider = resolveProviderArgument(trimmed, "/accounts connect ");
    if (!provider) {
      return invalidProviderUsage(
        "/accounts connect <elizacloud|codex|claude-code>",
      );
    }
    return formatProviderConnection(provider, context);
  }

  if (trimmed.startsWith("/accounts login ")) {
    const provider = resolveProviderArgument(trimmed, "/accounts login ");
    if (!provider) {
      return invalidProviderUsage(
        "/accounts login <elizacloud|codex|claude-code>",
      );
    }
    return handleAccountLogin(provider, hooks);
  }

  if (trimmed.startsWith("/accounts setup-token ")) {
    const provider = resolveProviderArgument(trimmed, "/accounts setup-token ");
    if (provider !== "claude-code") {
      return `Usage: ${displayCommand("/accounts setup-token claude-code")}`;
    }
    return handleClaudeSetupToken(hooks);
  }

  return undefined;
}
