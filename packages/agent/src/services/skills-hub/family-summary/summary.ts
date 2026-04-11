import type { SkillHubCatalogRecord, SkillHubFamilyRecord } from "../types";
import { incrementGroupedCount, mapToSortedGroupedRecords } from "./grouping";
import { rootFromSlug } from "./string-utils";
import type { SkillHubSummaryInput } from "./types";

export function buildSkillHubSummary(input: SkillHubSummaryInput): {
  workspaceTotal: number;
  catalogTotal: number;
  generatedTotal: number;
  installedTotal: number;
  installable: number;
  exportedManifests: number;
  familyTotal: number;
  curatedFamilyTotal: number;
  generatedFamilyTotal: number;
  manifestsDir: string;
  summary: string;
  distribution: {
    sources: Array<{
      source: "workspace" | "generated" | "catalog" | "installed";
      count: number;
    }>;
    categories: Array<{
      name: string;
      count: number;
      workspace: number;
      generated: number;
      catalog: number;
      installed: number;
    }>;
    roots: Array<{
      name: string;
      count: number;
      workspace: number;
      generated: number;
      catalog: number;
      installed: number;
    }>;
    tags: Array<{
      name: string;
      count: number;
      workspace: number;
      generated: number;
      catalog: number;
      installed: number;
    }>;
  };
  families: SkillHubFamilyRecord[];
  recentWorkspace: Array<{
    slug: string;
    title: string;
    category: string;
    root: string;
    source: "workspace" | "generated";
    tags: string[];
  }>;
  recentCatalog: Array<{
    slug: string;
    displayName: string;
    source: "catalog" | "workspace";
    installed: boolean;
    tags: string[];
  }>;
  recentInstalled: Array<{
    slug: string;
    title: string;
    source: string;
    category: string;
    root: string;
    tags: string[];
  }>;
} {
  const catalog: SkillHubCatalogRecord[] = input.catalog;
  const generated = input.workspace.filter(
    (entry) => entry.source === "generated",
  );
  const sourceSummary: Array<{
    source: "workspace" | "generated" | "catalog" | "installed";
    count: number;
  }> = [
    {
      source: "workspace",
      count: input.workspace.filter((entry) => entry.source === "workspace")
        .length,
    },
    { source: "generated", count: generated.length },
    { source: "catalog", count: catalog.length },
    { source: "installed", count: input.installed.length },
  ];

  const categoryGroups = new Map<
    string,
    {
      count: number;
      workspace: number;
      generated: number;
      catalog: number;
      installed: number;
    }
  >();
  const rootGroups = new Map<
    string,
    {
      count: number;
      workspace: number;
      generated: number;
      catalog: number;
      installed: number;
    }
  >();
  const tagGroups = new Map<
    string,
    {
      count: number;
      workspace: number;
      generated: number;
      catalog: number;
      installed: number;
    }
  >();

  for (const entry of input.workspace) {
    incrementGroupedCount(categoryGroups, entry.category, entry.source);
    incrementGroupedCount(rootGroups, entry.root, entry.source);
    for (const tag of entry.tags) {
      incrementGroupedCount(tagGroups, tag, entry.source);
    }
  }
  for (const entry of catalog) {
    incrementGroupedCount(categoryGroups, rootFromSlug(entry.slug), "catalog");
    incrementGroupedCount(rootGroups, rootFromSlug(entry.slug), "catalog");
    for (const tag of entry.tagList) {
      incrementGroupedCount(tagGroups, tag, "catalog");
    }
  }
  for (const entry of input.installed) {
    incrementGroupedCount(categoryGroups, entry.category, "installed");
    incrementGroupedCount(rootGroups, entry.root, "installed");
  }

  return {
    workspaceTotal: input.workspace.length,
    generatedTotal: generated.length,
    catalogTotal: input.lastSyncReport?.catalogTotal ?? catalog.length,
    installedTotal: input.installed.length,
    installable: input.workspace.filter((entry) => entry.installable).length,
    exportedManifests: input.lastSyncReport?.exportedManifests ?? 0,
    familyTotal: input.families.length,
    curatedFamilyTotal: input.families.filter(
      (entry) => entry.kind === "curated",
    ).length,
    generatedFamilyTotal: input.families.filter(
      (entry) => entry.kind === "generated",
    ).length,
    manifestsDir: input.manifestsDir,
    summary: `workspace=${input.workspace.length} generated=${generated.length} catalog=${input.lastSyncReport?.catalogTotal ?? catalog.length} installed=${input.installed.length} families=${input.families.length}`,
    distribution: {
      sources: sourceSummary,
      categories: mapToSortedGroupedRecords(categoryGroups).slice(0, 12),
      roots: mapToSortedGroupedRecords(rootGroups).slice(0, 12),
      tags: mapToSortedGroupedRecords(tagGroups).slice(0, 20),
    },
    families: input.families.slice(0, 12),
    recentWorkspace: input.workspace
      .slice()
      .sort((left, right) =>
        (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
      )
      .slice(0, 8)
      .map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        category: entry.category,
        root: entry.root,
        source: entry.source,
        tags: entry.tags,
      })),
    recentCatalog: catalog.slice(0, 8).map((entry) => ({
      slug: entry.slug,
      displayName: entry.displayName,
      source: entry.source,
      installed: entry.installed,
      tags: entry.tagList,
    })),
    recentInstalled: input.installed.slice(0, 8).map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      source: entry.source,
      category: entry.category,
      root: entry.root,
      tags: input.installedTagsBySlug(entry.slug),
    })),
  };
}
