import type { CompactCatalogEntry } from "./components/CompactCatalogList";
import { asString, titleCase, type UnknownRecord } from "./lib";

export function buildSkillCatalogEntries(
  entries: UnknownRecord[],
): CompactCatalogEntry[] {
  return entries.map((entry, index) => {
    const slug = asString(entry.slug, asString(entry.id, `skill-${index}`));
    return {
      id: slug,
      title: asString(entry.name, titleCase(slug)),
      description: asString(
        entry.description,
        "A locally available Doolittle skill.",
      ),
      descriptionMode: "inline",
      code: slug,
    };
  });
}
