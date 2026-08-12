import { asString, titleCase, type UnknownRecord } from "./lib";

export interface SkillCatalogItem {
  id: string;
  title: string;
  description: string;
  slug: string;
  family: string;
  source: string;
  commandName: string;
  userInvocable: boolean;
  modelInvocable: boolean;
}

export function buildSkillCatalogEntries(
  entries: UnknownRecord[],
): SkillCatalogItem[] {
  return entries.map((entry, index) => {
    const slug = asString(entry.slug, asString(entry.id, `skill-${index}`));
    const family = slug.split("/")[0] || "general";
    return {
      id: slug,
      title: asString(entry.title, asString(entry.name, titleCase(slug))),
      description: asString(
        entry.description,
        "A locally available Doolittle skill.",
      ),
      slug,
      family,
      source: asString(entry.source, "workspace"),
      commandName: asString(entry.commandName, slug),
      userInvocable: entry.userInvocable !== false,
      modelInvocable: entry.disableModelInvocation !== true,
    };
  });
}
