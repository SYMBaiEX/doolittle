export function titleizeSlug(value: string): string {
  return value
    .replaceAll("/", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/gu, (match) => match.toUpperCase())
    .replace(/\s+/gu, " ")
    .trim();
}

export function matchesFamily(slug: string, familySlug: string): boolean {
  return (
    slug === familySlug ||
    slug.startsWith(`${familySlug}/`) ||
    (familySlug === "generated" && slug.startsWith("generated/"))
  );
}

export function rootFromSlug(slug: string): string {
  const normalized = slug.replaceAll("\\", "/");
  return normalized.split("/")[0] || "unknown";
}
