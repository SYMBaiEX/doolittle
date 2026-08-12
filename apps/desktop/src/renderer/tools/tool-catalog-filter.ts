import { asArray, asString, type UnknownRecord } from "../lib";

export function filterToolEntries(
  entries: readonly UnknownRecord[],
  query: string,
  category: string,
): UnknownRecord[] {
  const normalized = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (category !== "all" && asString(entry.category) !== category) {
      return false;
    }
    if (!normalized) return true;
    return [
      entry.id,
      entry.name,
      entry.description,
      entry.category,
      entry.transport,
      entry.source,
      ...asArray(entry.similes),
      ...asArray(entry.allowedProfiles),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}

export function toolEntryCategories(
  entries: readonly UnknownRecord[],
): string[] {
  return [
    "all",
    ...new Set(
      entries.map((entry) => asString(entry.category)).filter(Boolean),
    ),
  ];
}
