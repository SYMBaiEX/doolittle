import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SkillDocument } from "@/types";
import type { AgentSdkService } from "../agent-sdk-service";
import type {
  SkillHubImportResult,
  SkillHubManifest,
  SkillHubWorkspaceRecord,
} from "./types";

type CatalogSkillLike = NonNullable<
  Awaited<ReturnType<AgentSdkService["catalogSkill"]>>
>;

export interface SkillsHubManifestHost {
  manifestsDir: string;
  importsDir: string;
  installedIndexPath: string;
  nowIso(): string;
  normalizeSlug(value: string): string;
  rootFromSlug(slug: string): string;
  categoryFromSlug(slug: string): string;
  countLines(content: string): number;
  hashContent(content: string): string;
  tagsFromText(content: string): string[];
  tagsFromCatalog(tags: Record<string, string>): string[];
}

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

export function readSkillHubInstalledIndex(
  installedIndexPath: string,
): SkillHubManifest[] {
  if (!existsSync(installedIndexPath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(installedIndexPath, "utf8")) as {
      manifests?: SkillHubManifest[];
    };
    return parsed.manifests ?? [];
  } catch {
    return [];
  }
}

export function normalizeInstalledSkillHubManifest(
  manifest: Partial<SkillHubManifest> & {
    slug: string;
    title: string;
    description: string;
    path: string;
    root: string;
    category: string;
    installable: boolean;
    content: string;
    contentLength: number;
    lineCount: number;
    hash: string;
    tags: string[];
    generatedAt: string;
  },
): SkillHubManifest {
  return {
    ...manifest,
    kind: "skill-manifest",
    source: "installed",
  };
}

export function writeSkillHubInstalledIndex(
  host: SkillsHubManifestHost,
  manifests: SkillHubManifest[],
): void {
  writeFileSync(
    host.installedIndexPath,
    JSON.stringify(
      {
        generatedAt: host.nowIso(),
        manifests: manifests.map((entry) =>
          normalizeInstalledSkillHubManifest(entry),
        ),
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function listInstalledSkillHubManifests(
  installedIndexPath: string,
): Array<{
  slug: string;
  title: string;
  path: string;
  installedAt: string;
  source: string;
  root: string;
  category: string;
}> {
  return readSkillHubInstalledIndex(installedIndexPath).map((entry) => ({
    slug: entry.slug,
    title: entry.title,
    path: entry.path,
    installedAt: entry.generatedAt,
    source: entry.source,
    root: entry.root,
    category: entry.category,
  }));
}

export function findInstalledSkillHubManifest(
  installedIndexPath: string,
  slug: string,
  normalizeSlug: (value: string) => string,
): SkillHubManifest | undefined {
  const normalized = normalizeSlug(slug);
  return readSkillHubInstalledIndex(installedIndexPath).find(
    (entry) => normalizeSlug(entry.slug) === normalized,
  );
}

export function importSkillHubManifest(
  host: SkillsHubManifestHost,
  sourcePath: string,
): SkillHubImportResult {
  const manifest = JSON.parse(readFileSync(sourcePath, "utf8")) as
    | SkillHubManifest
    | {
        slug?: string;
        title?: string;
        description?: string;
        content?: string;
        source?: string;
      };
  const slug = host.normalizeSlug(manifest.slug ?? "imported-skill");
  const title = manifest.title ?? slug;
  const description = manifest.description ?? "Imported skill manifest.";
  const installDir = join(host.importsDir, slug);
  mkdirSync(installDir, { recursive: true });
  const skillPath = join(installDir, "SKILL.md");
  const content =
    "content" in manifest && typeof manifest.content === "string"
      ? manifest.content
      : [
          `# ${title}`,
          "",
          description,
          "",
          "## Install Notes",
          `Imported from ${sourcePath}.`,
        ].join("\n");

  writeFileSync(skillPath, content, "utf8");
  const manifestPath = join(installDir, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        kind: "skill-manifest",
        ...manifest,
        slug,
        title,
        description,
        source: "installed",
        installedAt: host.nowIso(),
        skillPath,
      },
      null,
      2,
    ),
    "utf8",
  );

  const installedManifest = normalizeInstalledSkillHubManifest({
    ...manifest,
    slug,
    title,
    description,
    source: "installed",
    path: manifestPath,
    root: host.rootFromSlug(slug),
    category: host.categoryFromSlug(slug),
    installable: true,
    content,
    contentLength: content.length,
    lineCount: host.countLines(content),
    hash: host.hashContent(content),
    tags: host.tagsFromText(content),
    generatedAt: host.nowIso(),
    workspacePath: skillPath,
    kind: "skill-manifest",
  });
  const installed = readSkillHubInstalledIndex(host.installedIndexPath).filter(
    (entry) => host.normalizeSlug(entry.slug) !== slug,
  );
  writeSkillHubInstalledIndex(host, [...installed, installedManifest]);

  return {
    sourcePath,
    manifestPath,
    skillPath,
    slug,
    title,
    source: "installed",
  };
}

export function writeSkillHubManifest(
  manifestPath: string,
  manifest: SkillHubManifest,
): SkillHubManifest {
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return {
    ...manifest,
    path: manifestPath,
  };
}
