import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { NodeSessionDatabase, type SessionDatabase } from "../database";
import { migrateSessionDatabase } from "../schema";

export function createSessionDatabase(baseDir: string): SessionDatabase {
  const dbPath = join(baseDir, "state.db");
  mkdirSync(dirname(dbPath), { recursive: true });
  // The Eliza memory adapter uses the same file and a matching busy timeout.
  const db = new NodeSessionDatabase(dbPath, { timeout: 5_000 });
  try {
    migrateSessionDatabase(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function continuityKeyFor(sessionId: string): string {
  return sessionId.split(":").slice(0, 2).join(":") || sessionId;
}
