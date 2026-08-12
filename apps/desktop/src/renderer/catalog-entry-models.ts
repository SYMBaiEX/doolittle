import type {
  CompactCatalogEntry,
  CompactCatalogFact,
} from "./components/CompactCatalogList";
import { catalogExceptionStatus } from "./components/CompactCatalogList";
import { asString, titleCase, type UnknownRecord } from "./lib";

function toolPolicyFacts(
  entry: UnknownRecord,
): CompactCatalogFact[] | undefined {
  const reason = asString(entry.policyReason);
  return entry.enabled === false && reason
    ? [{ label: "Policy", value: reason }]
    : undefined;
}

function nonNativeTransport(entry: UnknownRecord): string | undefined {
  const transport = asString(entry.transport, "native");
  const normalized = transport.toLowerCase();
  if (normalized === "native") return undefined;
  return normalized === "mcp" || normalized === "acp"
    ? normalized.toUpperCase()
    : titleCase(transport);
}

export function buildToolCatalogEntries(
  entries: UnknownRecord[],
): CompactCatalogEntry[] {
  const categories = entries.map((entry) =>
    titleCase(asString(entry.category, "uncategorized")),
  );
  const showGroups = new Set(categories).size > 1;
  const projected: CompactCatalogEntry[] = entries.map((entry, index) => {
    const id = asString(entry.id, `tool-${index}`);
    return {
      id,
      ...(showGroups ? { group: categories[index] } : {}),
      title: asString(entry.name, id || "Unnamed tool"),
      description: asString(entry.description, "No description provided."),
      descriptionMode: "inline",
      ...catalogExceptionStatus(entry.enabled !== false, "Disabled"),
      code: id,
      meta: nonNativeTransport(entry),
      facts: toolPolicyFacts(entry),
      detailsLabel: "Policy",
    };
  });
  return showGroups
    ? [...projected].sort((left, right) =>
        (left.group ?? "").localeCompare(right.group ?? ""),
      )
    : projected;
}

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
