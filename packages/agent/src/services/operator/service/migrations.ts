import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { EnvConfig } from "@/types";
import {
  applyMigration,
  getMigrationHistory,
  getMigrationSources,
  inspectMigrationSource,
  type MigrationHistoryEntry,
  type MigrationInspection,
  type MigrationResult,
  type MigrationSourceSummary,
} from "../migrations";

export interface OperatorMigrationOperations {
  listSources(): MigrationSourceSummary[];
  inspectSource(sourcePath: string): MigrationInspection;
  apply(sourcePath: string, options?: { overwrite?: boolean }): MigrationResult;
  history(limit?: number): MigrationHistoryEntry[];
}

export function createOperatorMigrationOperations(
  config: EnvConfig,
): OperatorMigrationOperations {
  const migrationsDir = join(config.dataDir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });

  return {
    listSources(): MigrationSourceSummary[] {
      return getMigrationSources(config);
    },
    inspectSource(sourcePath: string): MigrationInspection {
      return inspectMigrationSource(sourcePath);
    },
    apply(
      sourcePath: string,
      options?: { overwrite?: boolean },
    ): MigrationResult {
      return applyMigration({
        sourcePath,
        config,
        migrationsDir,
        overwrite: options?.overwrite,
      });
    },
    history(limit = 20): MigrationHistoryEntry[] {
      return getMigrationHistory(migrationsDir, limit);
    },
  };
}
