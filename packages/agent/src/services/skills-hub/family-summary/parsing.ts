import { existsSync, readFileSync } from "node:fs";
import { titleizeSlug } from "./string-utils";
import type { CuratedFamilyDefinition } from "./types";

export function parseFamilyDescriptions(content: string): Map<string, string> {
  const descriptions = new Map<string, string>();
  let inCategoryMap = false;
  let currentSlug: string | undefined;

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trimEnd();
    if (line === "## Category map") {
      inCategoryMap = true;
      currentSlug = undefined;
      continue;
    }
    if (inCategoryMap && line.startsWith("## ") && line !== "## Category map") {
      break;
    }
    if (!inCategoryMap) {
      continue;
    }

    const slugMatch = line.match(/^\s*-\s+`([^`]+)`$/u);
    if (slugMatch) {
      currentSlug = slugMatch[1];
      continue;
    }

    const descriptionMatch = line.match(/^\s*-\s+(.+)$/u);
    if (currentSlug && descriptionMatch) {
      descriptions.set(currentSlug, descriptionMatch[1].trim());
      currentSlug = undefined;
    }
  }

  return descriptions;
}

export function readCuratedFamilies(
  familyIndexPath: string,
  familyReadmePath: string,
): CuratedFamilyDefinition[] {
  const indexContent = existsSync(familyIndexPath)
    ? readFileSync(familyIndexPath, "utf8")
    : "";
  const readmeContent = existsSync(familyReadmePath)
    ? readFileSync(familyReadmePath, "utf8")
    : "";
  const descriptions = parseFamilyDescriptions(readmeContent);

  const families: CuratedFamilyDefinition[] = [];

  for (const line of indexContent.split(/\r?\n/u)) {
    const match = line.match(/^- `([^`]+)` - \[`[^`]+`\]\((\.\/[^)]+)\)$/u);
    if (!match) {
      continue;
    }
    const slug = match[1] ?? "";
    const path = match[2] ?? "";
    families.push({
      slug,
      path,
      title: titleizeSlug(slug),
      description:
        descriptions.get(slug) ?? `Curated skill family for ${slug}.`,
    });
  }

  return families;
}
