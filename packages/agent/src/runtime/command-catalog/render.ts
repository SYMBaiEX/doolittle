import { normalizeSlashCommandSyntax } from "@/runtime/slash-command-syntax";
import { getCommandCatalogEntries } from "./registry";
import { rankCommandCatalogEntries } from "./search";

export function renderCommandCatalog(
  query?: string,
  limit = 80,
  workspaceDir?: string,
): string {
  const catalog = getCommandCatalogEntries(workspaceDir);
  // Browse (no query) shows the entire catalog — never silently drop commands;
  // the `limit` only bounds ranked search results.
  const entries = query?.trim()
    ? rankCommandCatalogEntries(catalog, query, limit)
    : catalog;

  return entries
    .map(
      (entry) =>
        `${normalizeSlashCommandSyntax(entry.command)} — ${entry.description}`,
    )
    .join("\n");
}
