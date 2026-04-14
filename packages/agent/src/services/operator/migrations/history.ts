import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MigrationHistoryEntry } from "./types";

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
