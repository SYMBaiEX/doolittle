import type { CompactCatalogEntry } from "../components/CompactCatalogList";
import { catalogExceptionStatus } from "../components/CompactCatalogList";
import { asString, titleCase, type UnknownRecord } from "../lib";

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
    return {
      id,
      group: titleCase(asString(entry.category, "plugin")),
      title: titleCase(id || "Unnamed plugin"),
      description: asString(entry.notes, "No plugin notes available."),
      descriptionMode: "inline",
      ...catalogExceptionStatus(Boolean(entry.enabled), "Inactive"),
      code: asString(entry.packageName, id),
      meta: pluginMeta(entry),
    };
  });
}
