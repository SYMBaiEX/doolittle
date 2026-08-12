import type { CompactCatalogEntry } from "../components/CompactCatalogList";
import { catalogExceptionStatus } from "../components/CompactCatalogList";
import { asString, titleCase, type UnknownRecord } from "../lib";

const PLUGIN_LABEL_WORDS: Record<string, string> = {
  acp: "ACP",
  api: "API",
  cli: "CLI",
  elizacloud: "Eliza Cloud",
  llm: "LLM",
  mcp: "MCP",
  oauth: "OAuth",
  openai: "OpenAI",
  pdf: "PDF",
  sql: "SQL",
};

export function pluginDisplayTitle(id: string, category: string): string {
  const categoryPrefix = `${category.trim().toLowerCase()}-`;
  const ungroupedId = id.toLowerCase().startsWith(categoryPrefix)
    ? id.slice(categoryPrefix.length)
    : id;
  const words = ungroupedId.split(/[-_\s]+/u).filter(Boolean);
  return words
    .map((word) => PLUGIN_LABEL_WORDS[word.toLowerCase()] ?? titleCase(word))
    .join(" ");
}

function pluginMeta(entry: UnknownRecord): string | undefined {
  const values = [asString(entry.source), asString(entry.maturity)]
    .filter(Boolean)
    .map(titleCase);
  return values.length ? values.join(" · ") : undefined;
}

export function buildPluginCatalogEntries(
  entries: UnknownRecord[],
): CompactCatalogEntry[] {
  return entries.map((entry, index) => {
    const id = asString(entry.id, `plugin-${index}`);
    const category = asString(entry.category, "plugin");
    return {
      id,
      group: titleCase(category),
      title: pluginDisplayTitle(id || "unnamed-plugin", category),
      description: asString(entry.notes, "No plugin notes available."),
      descriptionMode: "inline",
      ...catalogExceptionStatus(Boolean(entry.enabled), "Inactive"),
      code: asString(entry.packageName, id),
      meta: pluginMeta(entry),
    };
  });
}
