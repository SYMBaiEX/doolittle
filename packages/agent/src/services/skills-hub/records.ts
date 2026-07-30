import { createHash } from "node:crypto";
import { join } from "node:path";
import type { SkillSynthesisService } from "../skill-synthesis/service";
import type { SkillsService } from "../skills/service";
import type { SkillHubWorkspaceRecord } from "./types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeSkillHubSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/.-]+/gu, "-")
    .replace(/\/+/gu, "/")
    .replace(/^-+|-+$/gu, "");
}

export function hashSkillHubContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

export function countSkillHubLines(content: string): number {
  if (!content.trim()) {
    return 0;
  }
  return content.split(/\r?\n/u).length;
}

export function categoryFromSkillHubSlug(slug: string): string {
  const normalized = slug.replaceAll("\\", "/");
  return normalized.includes("/")
    ? normalized.split("/").slice(0, 2).join("/")
    : normalized;
}

export function rootFromSkillHubSlug(slug: string): string {
  const normalized = slug.replaceAll("\\", "/");
  return normalized.split("/")[0] ?? "unknown";
}

export function tagsFromSkillHubText(content: string): string[] {
  const tags = new Set<string>();
  for (const match of content.matchAll(
    /^(?:-|\*|#|##|###)\s*([A-Za-z0-9][A-Za-z0-9-_/ ]{1,48})$/gmu,
  )) {
    const value = match[1]?.trim().toLowerCase();
    if (value) {
      tags.add(value.replace(/\s+/gu, "-"));
    }
  }
  return [...tags].slice(0, 8);
}

export function buildSkillHubWorkspaceRecords(
  skills: SkillsService,
  skillSynthesis: SkillSynthesisService,
  manifestsDir: string,
): SkillHubWorkspaceRecord[] {
  const generated = new Map(
    skillSynthesis.listGeneratedSkills().map((record) => [record.slug, record]),
  );

  return skills.workspace().map((skill) => {
    const normalized = normalizeSkillHubSlug(skill.slug);
    const generatedRecord = generated.get(normalized);
    const content = skill.content;

    return {
      slug: skill.slug,
      title: skill.title,
      description: skill.description,
      path: skill.path,
      root: rootFromSkillHubSlug(skill.slug),
      category: categoryFromSkillHubSlug(skill.slug),
      tags: tagsFromSkillHubText(content),
      source: skill.source === "generated" ? "generated" : "workspace",
      installable: true,
      contentLength: content.length,
      lineCount: countSkillHubLines(content),
      hash: hashSkillHubContent(content),
      manifestPath: join(manifestsDir, `${normalized}.json`),
      taskId: generatedRecord?.taskId,
      objective: generatedRecord?.objective,
      updatedAt: generatedRecord?.updatedAt,
    };
  });
}

export function findSkillHubWorkspaceRecord(
  workspace: SkillHubWorkspaceRecord[],
  slug: string,
): SkillHubWorkspaceRecord | undefined {
  const normalized = normalizeSkillHubSlug(slug);
  return workspace.find(
    (entry) => normalizeSkillHubSlug(entry.slug) === normalized,
  );
}

export function toSkillHubBundleSlug(value: string): string {
  return normalizeSkillHubSlug(value).replaceAll("/", "-");
}
