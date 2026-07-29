import { canonicalizeSlashCommandSyntax } from "@/runtime/slash-command-syntax";
import { getWorkflowCommandCatalogEntries } from "@/runtime/workflow-commands";
import { COMMAND_CATALOG_DEFINITIONS } from "./definitions";
import type { CommandCatalogEntry } from "./types";

function commandRoot(command: string): string | undefined {
  const trimmed = command.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }
  return trimmed.split(/\s+/u, 1)[0];
}

function canonicalizeEntry(entry: CommandCatalogEntry): CommandCatalogEntry {
  const command = canonicalizeSlashCommandSyntax(entry.command);
  const aliases = new Set(entry.aliases ?? []);
  const rawRoot = commandRoot(entry.command);
  const canonicalRoot = commandRoot(command);
  if (rawRoot && rawRoot !== canonicalRoot) {
    aliases.add(rawRoot);
  }

  return {
    ...entry,
    command,
    aliases: aliases.size ? [...aliases].sort() : undefined,
  };
}

export const COMMAND_CATALOG: CommandCatalogEntry[] =
  COMMAND_CATALOG_DEFINITIONS.map(canonicalizeEntry);

export function getCommandCatalogEntries(
  workspaceDir?: string,
): CommandCatalogEntry[] {
  if (!workspaceDir) {
    return COMMAND_CATALOG;
  }

  const merged = new Map<string, CommandCatalogEntry>(
    COMMAND_CATALOG.map((entry) => [entry.command, entry]),
  );

  for (const entry of getWorkflowCommandCatalogEntries(workspaceDir)) {
    const canonicalEntry = canonicalizeEntry(entry);
    merged.set(canonicalEntry.command, canonicalEntry);
  }

  return [...merged.values()];
}
