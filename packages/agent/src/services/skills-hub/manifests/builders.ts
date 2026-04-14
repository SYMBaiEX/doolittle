import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillDocument } from "@/types";
import type { SkillHubManifest, SkillHubWorkspaceRecord } from "../types";
import type { CatalogSkillLike, SkillsHubManifestHost } from "./types";

export function buildSkillHubManifestFromWorkspace(
  host: SkillsHubManifestHost,
  skill: SkillHubWorkspaceRecord | SkillDocument,
): SkillHubManifest {
  const content = readFileSync(skill.path, "utf8");
  const slug = host.normalizeSlug(skill.slug);
  return {
    kind: "skill-manifest",
    slug,
    title: skill.title,
    description: skill.description,
    source: slug.startsWith("generated/") ? "generated" : "workspace",
    path: join(host.manifestsDir, `${slug}.json`),
    root: host.rootFromSlug(slug),
    category: host.categoryFromSlug(slug),
    installable: true,
    content,
    contentLength: content.length,
    lineCount: host.countLines(content),
    hash: host.hashContent(content),
    tags: host.tagsFromText(content),
    generatedAt: host.nowIso(),
    workspacePath: skill.path,
  };
}

export function buildSkillHubCatalogManifest(
  host: SkillsHubManifestHost,
  slug: string,
  entry?: CatalogSkillLike,
): SkillHubManifest {
  const normalized = host.normalizeSlug(slug);
  const title = entry?.displayName ?? slug;
  const summary = entry?.summary ?? "Imported from the ElizaOS skill catalog.";
  const content = [
    `# ${title}`,
    "",
    summary ?? "No summary available.",
    "",
    "## Source",
    `- Catalog slug: ${entry?.slug ?? slug}`,
    `- Installs current: ${entry?.stats.installsCurrent ?? 0}`,
    `- Installs all-time: ${entry?.stats.installsAllTime ?? 0}`,
    `- Stars: ${entry?.stats.stars ?? 0}`,
    "",
    "## Tags",
    ...(entry?.tags
      ? Object.entries(entry.tags).map(([key, value]) => `- ${key}: ${value}`)
      : ["- none"]),
  ].join("\n");

  return {
    kind: "skill-manifest",
    slug: normalized,
    title,
    description: summary ?? "",
    source: "catalog",
    path: join(host.manifestsDir, `${normalized}.json`),
    root: host.rootFromSlug(normalized),
    category: host.categoryFromSlug(normalized),
    installable: true,
    content,
    contentLength: content.length,
    lineCount: host.countLines(content),
    hash: host.hashContent(content),
    tags: host.tagsFromText(content),
    tagList: host.tagsFromCatalog(entry?.tags ?? {}),
    generatedAt: host.nowIso(),
    catalog: entry
      ? {
          displayName: entry.displayName,
          summary: entry.summary,
          installsCurrent: entry.stats.installsCurrent,
          installsAllTime: entry.stats.installsAllTime,
          stars: entry.stats.stars,
          versions: entry.stats.versions,
        }
      : undefined,
  };
}
