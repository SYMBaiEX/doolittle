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
    expect(
      (
        db.query("PRAGMA table_info(messages)").all() as Array<{
          name: string;
        }>
      ).some((column) => column.name === "attachments_json"),
    ).toBe(true);
  });

  it("adds attachment metadata storage to a legacy database idempotently", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    migrateSessionDatabase(db);
    migrateSessionDatabase(db);

    const columns = db.query("PRAGMA table_info(messages)").all() as Array<{
      name: string;
    }>;
    expect(
      columns.filter((column) => column.name === "attachments_json"),
    ).toHaveLength(1);
  });
});
