import { describe, expect, it } from "vitest";
import { NodeSessionDatabase as Database } from "@/services/session/database";
import { migrateSessionDatabase } from "./schema";

describe("session/schema", () => {
  it("creates the core session tables and indexes", () => {
    const db = new Database(":memory:");
    migrateSessionDatabase(db);

    const tables = db
      .query(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('messages', 'message_origins', 'session_metadata', 'session_lineage', 'session_imports', 'projects', 'project_resources', 'session_projects') ORDER BY name`,
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((entry) => entry.name)).toEqual([
      "message_origins",
      "messages",
      "project_resources",
      "projects",
      "session_imports",
      "session_lineage",
      "session_metadata",
      "session_projects",
    ]);
    expect(
      (
        db.query("PRAGMA table_info(messages)").all() as Array<{
          name: string;
        }>
      ).some((column) => column.name === "attachments_json"),
    ).toBe(true);
    expect(
      db
        .query(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND name IN ('long_term_memories', 'session_summaries')`,
        )
        .all(),
    ).toEqual([]);
  });

  it("adds immutable fork lineage tables to a legacy database idempotently", () => {
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
      );
      CREATE TABLE session_metadata (
        session_id TEXT PRIMARY KEY,
        title TEXT,
        continuity_key TEXT,
        updated_at TEXT NOT NULL
      );
    `);

    migrateSessionDatabase(db);
    migrateSessionDatabase(db);

    const lineageTables = db
      .query(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('message_origins', 'session_imports', 'session_lineage') ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    expect(lineageTables.map((row) => row.name)).toEqual([
      "message_origins",
      "session_imports",
      "session_lineage",
    ]);
    expect(
      db.query("SELECT COUNT(*) as count FROM session_lineage").get(),
    ).toEqual({ count: 0 });
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

  it("keeps legacy sessions unscoped while adding project association tables", () => {
    const db = new Database(":memory:");
    db.exec(
      `CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, room_id TEXT NOT NULL, entity_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL)`,
    );
    migrateSessionDatabase(db);
    expect(
      db.query("SELECT COUNT(*) as count FROM session_projects").get(),
    ).toEqual({ count: 0 });
    migrateSessionDatabase(db);
    expect(
      db.query("SELECT COUNT(*) as count FROM session_projects").get(),
    ).toEqual({ count: 0 });
  });
});
