import { asArray, asString, type UnknownRecord } from "../lib";

export interface ToolCatalogItem {
  id: string;
  title: string;
  description: string;
  category: string;
  transport: string;
  source: string;
  enabled: boolean;
  policyReason: string;
  aliases: string[];
  allowedProfiles: string[];
}

function stringList(value: unknown): string[] {
  return asArray(value)
    .map((entry) => asString(entry))
    .filter(Boolean);
}

export function buildToolCatalogItems(
  entries: UnknownRecord[],
): ToolCatalogItem[] {
  return entries.map((entry, index) => {
    const id = asString(entry.id, `tool-${index}`);
    return {
      id,
      title: asString(entry.name, id || "Unnamed tool"),
      description: asString(entry.description, "No description provided."),
      category: asString(entry.category, "uncategorized"),
      transport: asString(entry.transport, "native"),
      source: asString(entry.source, "runtime"),
      enabled: entry.enabled !== false,
      policyReason: asString(entry.policyReason),
      aliases: stringList(entry.similes),
      allowedProfiles: stringList(entry.allowedProfiles),
    };
  });
}
