import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { migrateSessionDatabase } from "./schema";

describe("session/schema", () => {
  it("creates the core session tables and indexes", () => {
    const db = new Database(":memory:");
    migrateSessionDatabase(db);

    const tables = db
      .query(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('messages', 'session_metadata', 'session_summaries') ORDER BY name`,
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((entry) => entry.name)).toEqual([
      "messages",
      "session_metadata",
      "session_summaries",
    ]);
  });
});
