import { resolveLinkedProviderName } from "../../linked-provider-accounts/index";
import { displayCommand } from "../command-execution";

export function invalidProviderUsage(command: string): string {
  return `Usage: ${displayCommand(command)}`;
}

export function resolveProviderArgument(
  trimmed: string,
  prefix: string,
): ReturnType<typeof resolveLinkedProviderName> {
  return resolveLinkedProviderName(trimmed.slice(prefix.length).trim());
}
