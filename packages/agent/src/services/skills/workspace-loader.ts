import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { SkillDocument } from "@/types";
import { stripSkillSuffix, titleFromPath } from "./paths";
import type { SkillSource } from "./types";

export function loadWorkspaceSkills(skillsDir: string): SkillDocument[] {
  return walk(skillsDir)
    .filter((path) => path.endsWith("SKILL.md"))
    .map((path) => {
      const content = readFileSync(path, "utf8");
      const title = extractTitle(content, path);
      const description = extractDescription(content);
      const slug = stripSkillSuffix(relative(skillsDir, path));
      const source: SkillSource = slug.startsWith("generated/")
        ? "generated"
        : "workspace";

      return {
        slug,
        title,
        description,
        path,
        content,
        source,
      };
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

function walk(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...walk(path));
    } else {
      files.push(path);
    }
  }

  return files;
}

function extractTitle(content: string, fallbackPath: string): string {
  const heading = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("#"));

  return heading ? heading.replace(/^#+\s*/u, "") : titleFromPath(fallbackPath);
}

function extractDescription(content: string): string {
  const bodyLine = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => Boolean(line) && !line.startsWith("#"));

  return bodyLine ?? "No description available.";
}
