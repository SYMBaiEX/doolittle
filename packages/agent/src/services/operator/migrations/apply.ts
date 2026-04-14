import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import type { EnvConfig } from "@/types";
import { findSkillRoot, inspectMigrationSource } from "./inspection";
import type { MigrationResult } from "./types";

export interface ApplyMigrationInput {
  sourcePath: string;
  config: EnvConfig;
  migrationsDir: string;
  overwrite?: boolean;
}

export function applyMigration(input: ApplyMigrationInput): MigrationResult {
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
