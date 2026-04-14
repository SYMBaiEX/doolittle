import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillHubImportResult, SkillHubManifest } from "../types";
import {
  normalizeInstalledSkillHubManifest,
  readSkillHubInstalledIndex,
  writeSkillHubInstalledIndex,
} from "./installed";
import type { SkillsHubManifestHost } from "./types";

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
