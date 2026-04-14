import { handleAccountsProviderCommand } from "./provider-targets";
import { handleAccountsReadCommand } from "./read";
import type {
  AccountsCommandContext,
  AccountsCommandHooks,
  AccountsCommandInput,
} from "./types";

export async function handleAccountsCommand(
  _input: AccountsCommandInput,
  trimmed: string,
  context: AccountsCommandContext,
  hooks?: AccountsCommandHooks,
): Promise<string | undefined> {
  return (
    (await handleAccountsReadCommand(trimmed, context)) ??
    (await handleAccountsProviderCommand(trimmed, context, hooks)) ??
    undefined
  );
}
