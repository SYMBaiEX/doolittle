import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { NodeSessionDatabase, type SessionDatabase } from "../database";
import { migrateSessionDatabase } from "../schema";

export function createSessionDatabase(baseDir: string): SessionDatabase {
  const dbPath = join(baseDir, "state.db");
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new NodeSessionDatabase(dbPath);
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
