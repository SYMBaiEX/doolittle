import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { MigrationInspection } from "./types";

const KNOWN_FILES = [
  ["AGENTS.md", "context"],
  ["SOUL.md", "persona"],
  ["MEMORY.md", "memory"],
  ["USER.md", "memory"],
] as const;

export function inspectMigrationSource(
  sourcePath: string,
): MigrationInspection {
  const rootPath = resolve(sourcePath);
  if (!existsSync(rootPath)) {
    return {
      rootPath,
      exists: false,
      files: [],
      skillCount: 0,
      contextCount: 0,
    };
  }

  const files: MigrationInspection["files"] = [];
  for (const [name, kind] of KNOWN_FILES) {
    const pathname = join(rootPath, name);
    if (existsSync(pathname)) {
      files.push({ path: pathname, kind });
    }
  }

  const skillsPath = join(rootPath, "skills");
  if (existsSync(skillsPath)) {
    for (const entry of walkSkills(skillsPath)) {
      files.push({ path: entry, kind: "skill" });
    }
  }

  return {
    rootPath,
    exists: true,
    files,
    skillCount: files.filter((entry) => entry.kind === "skill").length,
    contextCount: files.filter(
      (entry) => entry.kind === "context" || entry.kind === "persona",
    ).length,
  };
}

export function findSkillRoot(skillFile: string): string | null {
  const root = dirname(skillFile);
  return statSync(root).isDirectory() ? root : null;
}

function walkSkills(rootPath: string): string[] {
  const collected: string[] = [];
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const pathname = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      collected.push(...walkSkills(pathname));
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      collected.push(pathname);
    }
  }
  return collected;
}
