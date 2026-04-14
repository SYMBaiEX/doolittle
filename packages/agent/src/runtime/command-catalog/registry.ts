import { canonicalizeSlashCommandSyntax } from "@/runtime/slash-command-syntax";
import { getWorkflowCommandCatalogEntries } from "@/runtime/workflow-commands";
import { COMMAND_CATALOG_DEFINITIONS } from "./definitions";
import type { CommandCatalogEntry } from "./types";

function canonicalizeEntry(entry: CommandCatalogEntry): CommandCatalogEntry {
  return {
    ...entry,
    command: canonicalizeSlashCommandSyntax(entry.command),
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
    const canonical = canonicalizeSlashCommandSyntax(entry.command);
    merged.set(canonical, {
      ...entry,
      command: canonical,
    });
  }

  return [...merged.values()];
}
