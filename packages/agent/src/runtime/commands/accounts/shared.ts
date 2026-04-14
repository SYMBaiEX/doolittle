import { displayCommand } from "@/runtime/commands/command-execution";
import { resolveLinkedProviderName } from "@/runtime/linked-provider-accounts";

export function invalidProviderUsage(command: string): string {
  return `Usage: ${displayCommand(command)}`;
}

export function resolveProviderArgument(
  trimmed: string,
  prefix: string,
): ReturnType<typeof resolveLinkedProviderName> {
  return resolveLinkedProviderName(trimmed.slice(prefix.length).trim());
}
