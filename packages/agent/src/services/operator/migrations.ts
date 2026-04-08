import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import type { EnvConfig } from "@/types";

export interface MigrationSourceSummary {
  id: string;
  label: string;
  path: string;
  exists: boolean;
}

export interface MigrationInspection {
  rootPath: string;
  exists: boolean;
  files: Array<{
    path: string;
    kind: "context" | "memory" | "persona" | "skill" | "other";
  }>;
  skillCount: number;
  contextCount: number;
}

export interface MigrationResult {
  sourcePath: string;
  destinationPath: string;
  importedFiles: string[];
  importedSkills: string[];
  skippedFiles: string[];
  reportPath: string;
}

export interface MigrationHistoryEntry {
  createdAt: string;
  sourcePath: string;
  destinationPath: string;
  importedFiles: string[];
  importedSkills: string[];
  skippedFiles: string[];
  reportPath: string;
}

export function getMigrationSources(
  config: EnvConfig,
): MigrationSourceSummary[] {
  const openClawPath = join(homedir(), ".openclaw");
  return [
    {
      id: "openclaw",
      label: "OpenClaw home",
      path: openClawPath,
      exists: existsSync(openClawPath),
    },
    {
      id: "workspace",
      label: "Current workspace",
      path: config.workspaceDir,
      exists: existsSync(config.workspaceDir),
    },
  ];
}

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
  const knownFiles = [
    ["AGENTS.md", "context"],
    ["SOUL.md", "persona"],
    ["MEMORY.md", "memory"],
    ["USER.md", "memory"],
  ] as const;

  for (const [name, kind] of knownFiles) {
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

export function applyMigration(input: {
  sourcePath: string;
  config: EnvConfig;
  migrationsDir: string;
  overwrite?: boolean;
}): MigrationResult {
  const overwrite = input.overwrite ?? false;
  const inspection = inspectMigrationSource(input.sourcePath);
  if (!inspection.exists) {
    throw new Error(`Migration source not found: ${inspection.rootPath}`);
  }

  const importedFiles: string[] = [];
  const importedSkills: string[] = [];
  const skippedFiles: string[] = [];

  for (const entry of inspection.files) {
    if (entry.kind === "skill") {
      const skillRoot = findSkillRoot(entry.path);
      if (!skillRoot) {
        skippedFiles.push(entry.path);
        continue;
      }
      const slug = basename(skillRoot);
      const destination = join(input.config.skillsDir, "imports", slug);
      if (existsSync(destination) && !overwrite) {
        skippedFiles.push(destination);
        continue;
      }
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(skillRoot, destination, { recursive: true, force: overwrite });
      importedSkills.push(destination);
      continue;
    }

    const destination =
      entry.kind === "memory"
        ? join(input.migrationsDir, basename(entry.path))
        : join(input.config.workspaceDir, basename(entry.path));
    if (existsSync(destination) && !overwrite) {
      skippedFiles.push(destination);
      continue;
    }
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(entry.path, destination);
    importedFiles.push(destination);
  }

  const reportPath = join(input.migrationsDir, `migration-${Date.now()}.json`);
  const report = {
    createdAt: new Date().toISOString(),
    sourcePath: inspection.rootPath,
    destinationPath: input.config.workspaceDir,
    importedFiles,
    importedSkills,
    skippedFiles,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  return {
    sourcePath: inspection.rootPath,
    destinationPath: input.config.workspaceDir,
    importedFiles,
    importedSkills,
    skippedFiles,
    reportPath,
  };
}

export function getMigrationHistory(
  migrationsDir: string,
  limit = 20,
): MigrationHistoryEntry[] {
  return readdirSync(migrationsDir)
    .filter(
      (entry) => entry.startsWith("migration-") && entry.endsWith(".json"),
    )
    .map((entry) => join(migrationsDir, entry))
    .map((pathname) => {
      const parsed = JSON.parse(readFileSync(pathname, "utf8")) as Omit<
        MigrationHistoryEntry,
        "reportPath"
      >;
      return {
        ...parsed,
        reportPath: pathname,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
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

function findSkillRoot(skillFile: string): string | null {
  const root = dirname(skillFile);
  return statSync(root).isDirectory() ? root : null;
}
