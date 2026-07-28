import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  NodeSessionDatabase,
  type SessionDatabase,
} from "@/services/session/database";
import { migrateSessionDatabase } from "../schema";

export function createSessionDatabase(baseDir: string): SessionDatabase {
  const dbPath = join(baseDir, "state.db");
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new NodeSessionDatabase(dbPath);
  migrateSessionDatabase(db);
  return db;
}

export function continuityKeyFor(sessionId: string): string {
  return sessionId.split(":").slice(0, 2).join(":") || sessionId;
}
