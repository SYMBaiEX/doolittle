import { canonicalizeSlashCommandSyntax } from "@/runtime/slash-command-syntax";
import { getCommandCatalogEntries } from "./registry";
import type { CommandCatalogEntry } from "./types";

export function rankCommandCatalogEntries(
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
  return rankCommandCatalogEntries(
    getCommandCatalogEntries(workspaceDir),
    input,
    limit,
  );
}
