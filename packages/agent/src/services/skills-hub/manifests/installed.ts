import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { SkillHubInstalledRecord, SkillHubManifest } from "../types";
import type { SkillsHubManifestHost } from "./types";

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
): SkillHubInstalledRecord[] {
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
