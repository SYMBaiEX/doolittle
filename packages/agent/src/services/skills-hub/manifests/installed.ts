import {
  readJsonFileSync,
  writeJsonAtomicSync,
} from "@elizaos/agent/utils/atomic-json";
import type { SkillHubInstalledRecord, SkillHubManifest } from "../types";
import type { SkillsHubManifestHost } from "./types";

export function readSkillHubInstalledIndex(
  installedIndexPath: string,
): SkillHubManifest[] {
  const parsed = readJsonFileSync<{ manifests?: SkillHubManifest[] }>(
    installedIndexPath,
  );
  return parsed?.manifests ?? [];
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
  writeJsonAtomicSync(host.installedIndexPath, {
    generatedAt: host.nowIso(),
    manifests: manifests.map((entry) =>
      normalizeInstalledSkillHubManifest(entry),
    ),
  });
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
