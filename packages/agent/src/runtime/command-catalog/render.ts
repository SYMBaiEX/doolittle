import { normalizeSlashCommandSyntax } from "@/runtime/slash-command-syntax";
import { getCommandCatalogEntries } from "./registry";
import { rankCommandCatalogEntries } from "./search";

export function renderCommandCatalog(
  query?: string,
  limit = 80,
  workspaceDir?: string,
): string {
  const catalog = getCommandCatalogEntries(workspaceDir);
  const entries = query?.trim()
    ? rankCommandCatalogEntries(catalog, query, limit)
    : catalog.slice(0, limit);

  return entries
    .map(
      (entry) =>
        `${normalizeSlashCommandSyntax(entry.command)} — ${entry.description}`,
    )
    .join("\n");
}
