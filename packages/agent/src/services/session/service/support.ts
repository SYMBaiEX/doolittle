import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { migrateSessionDatabase } from "../schema";

export function createSessionDatabase(baseDir: string): Database {
  const dbPath = join(baseDir, "state.db");
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });
  migrateSessionDatabase(db);
  return db;
}

export function continuityKeyFor(sessionId: string): string {
  return sessionId.split(":").slice(0, 2).join(":") || sessionId;
}
