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
  const normalizedCategory = category.trim().toLowerCase();
  const suffix = id.slice(normalizedCategory.length);
  const ungroupedId =
    id.slice(0, normalizedCategory.length).toLowerCase() ===
      normalizedCategory && /^[-_:./\s]+/u.test(suffix)
      ? suffix.replace(/^[-_:./\s]+/u, "")
      : id;
  const words = ungroupedId.split(/[-_:./\s]+/u).filter(Boolean);
  return words
    .map((word) => PLUGIN_LABEL_WORDS[word.toLowerCase()] ?? titleCase(word))
    .join(" ");
}

export interface PluginCatalogItem {
  id: string;
  title: string;
  description: string;
  packageName: string;
  category: string;
  source: string;
  kind: string;
  maturity: string;
  persistence: string;
  enabled: boolean;
}

export function buildPluginCatalogEntries(
  entries: UnknownRecord[],
): PluginCatalogItem[] {
  return entries.map((entry, index) => {
    const id = asString(entry.id, `plugin-${index}`);
    const category = asString(entry.category, "plugin");
    return {
      id,
      title: pluginDisplayTitle(id || "unnamed-plugin", category),
      description: asString(entry.notes, "No plugin notes available."),
      packageName: asString(entry.packageName, id),
      category,
      source: asString(entry.source, "unknown"),
      kind: asString(entry.kind, "unknown"),
      maturity: asString(entry.maturity, "unknown"),
      persistence: asString(entry.persistence, "none"),
      enabled: Boolean(entry.enabled),
    };
  });
}
