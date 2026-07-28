import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillDocument } from "@/types";
import type { SkillHubManifest, SkillHubWorkspaceRecord } from "../types";
import type { SkillsHubManifestHost } from "./types";

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
