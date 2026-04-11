import {
  canonicalizeSlashCommandSyntax,
  normalizeSlashCommandSyntax,
} from "@/runtime/slash-command-syntax";
import { getWorkflowCommandCatalogEntries } from "@/runtime/workflow-commands";
import {
  type CommandCatalogEntry,
  STATIC_COMMAND_CATALOG,
} from "./command-catalog-static";

export {
  canonicalizeSlashCommandSyntax,
  normalizeSlashCommandSyntax,
} from "@/runtime/slash-command-syntax";
export type { CommandCatalogEntry } from "./command-catalog-static";

export const COMMAND_CATALOG: CommandCatalogEntry[] = [
  ...STATIC_COMMAND_CATALOG,
  ...getWorkflowCommandCatalogEntries(),
].map((entry) => ({
  ...entry,
  command: canonicalizeSlashCommandSyntax(entry.command),
}));

function getCommandCatalogEntries(
  workspaceDir?: string,
): CommandCatalogEntry[] {
  if (!workspaceDir) {
    return COMMAND_CATALOG;
  }

  const merged = new Map<string, CommandCatalogEntry>();
  for (const entry of COMMAND_CATALOG) {
    merged.set(entry.command, entry);
  }
  for (const entry of getWorkflowCommandCatalogEntries(workspaceDir)) {
    const canonical = canonicalizeSlashCommandSyntax(entry.command);
    merged.set(canonical, {
      ...entry,
      command: canonical,
    });
  }
  return [...merged.values()];
}

function scoreCommandEntries(
  entries: CommandCatalogEntry[],
  input: string,
  limit: number,
): CommandCatalogEntry[] {
  const normalized = canonicalizeSlashCommandSyntax(input.trim()).toLowerCase();
  if (!normalized) {
    return entries.slice(0, limit);
  }

  const scored = entries
    .map((entry) => {
      const command = entry.command.toLowerCase();
      const description = entry.description.toLowerCase();
      let score = 0;

      if (command.startsWith(normalized)) {
        score += 5;
      }
      if (command.includes(normalized)) {
        score += 3;
      }
      if (description.includes(normalized)) {
        score += 1;
      }

      const tokens = normalized.split(/\s+/u).filter(Boolean);
      for (const token of tokens) {
        if (command.includes(token)) {
          score += 2;
        }
        if (description.includes(token)) {
          score += 1;
        }
      }

      return { entry, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!scored.length) {
    return entries.slice(0, limit);
  }

  return scored.slice(0, limit).map((entry) => entry.entry);
}

export function suggestCommands(
  input: string,
  limit = 8,
  workspaceDir?: string,
): CommandCatalogEntry[] {
  return scoreCommandEntries(
    getCommandCatalogEntries(workspaceDir),
    input,
    limit,
  );
}

export function renderCommandCatalog(
  query?: string,
  limit = 80,
  workspaceDir?: string,
): string {
  const catalog = getCommandCatalogEntries(workspaceDir);
  const entries = query?.trim()
    ? scoreCommandEntries(catalog, query, limit)
    : catalog.slice(0, limit);
  return entries
    .map(
      (entry) =>
        `${normalizeSlashCommandSyntax(entry.command)} — ${entry.description}`,
    )
    .join("\n");
}
