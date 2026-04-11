import { join } from "node:path";
import type {
  SkillHubCatalogRecord,
  SkillHubFamilyRecord,
  SkillHubWorkspaceRecord,
} from "../types";
import { matchesFamily } from "./string-utils";
import type { CuratedFamilyDefinition, InstalledSkillHubRecord } from "./types";

function buildRecentEntries(
  entries: Array<{
    slug: string;
    title: string;
    category: string;
    root: string;
    source: "workspace" | "generated" | "catalog" | "installed";
    updatedAt?: string;
  }>,
) {
  return entries
    .slice()
    .sort((left, right) =>
      (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
    )
    .slice(0, 5)
    .map(({ slug, title, category, root, source }) => ({
      slug,
      title,
      category,
      root,
      source,
    }));
}

export function buildCuratedFamilyRecord(
  family: CuratedFamilyDefinition,
  workspace: SkillHubWorkspaceRecord[],
  catalog: SkillHubCatalogRecord[],
  installed: InstalledSkillHubRecord[],
  skillsRootDir: string,
): SkillHubFamilyRecord {
  const workspaceMatches = workspace.filter((entry) =>
    matchesFamily(entry.slug, family.slug),
  );
  const catalogMatches = catalog.filter((entry) =>
    matchesFamily(entry.slug, family.slug),
  );
  const installedMatches = installed.filter((entry) =>
    matchesFamily(entry.slug, family.slug),
  );

  return {
    slug: family.slug,
    title: family.title,
    description: family.description,
    path: join(skillsRootDir, family.path.replace(/^\.\//u, "")),
    kind: "curated",
    workspaceTotal: workspaceMatches.length,
    generatedTotal: workspaceMatches.filter(
      (entry) => entry.source === "generated",
    ).length,
    catalogTotal: catalogMatches.length,
    installedTotal: installedMatches.length,
    recent: buildRecentEntries(
      workspaceMatches.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        category: entry.category,
        root: entry.root,
        source: entry.source,
        updatedAt: entry.updatedAt,
      })),
    ),
  };
}

export function buildGeneratedFamilyRecord(
  generated: SkillHubWorkspaceRecord[],
  catalog: SkillHubCatalogRecord[],
  installed: InstalledSkillHubRecord[],
  skillsRootDir: string,
): SkillHubFamilyRecord {
  return {
    slug: "generated",
    title: "Generated Skills",
    description:
      "Skill manifests synthesized from delegated workstreams and replayed tasks.",
    path: join(skillsRootDir, "generated"),
    kind: "generated",
    workspaceTotal: generated.length,
    generatedTotal: generated.length,
    catalogTotal: catalog.filter((entry) => entry.slug.startsWith("generated/"))
      .length,
    installedTotal: installed.filter((entry) =>
      entry.slug.startsWith("generated/"),
    ).length,
    recent: buildRecentEntries(
      generated.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        category: entry.category,
        root: entry.root,
        source: entry.source,
        updatedAt: entry.updatedAt,
      })),
    ),
  };
}
