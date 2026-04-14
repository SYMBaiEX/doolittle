import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import type { SessionMetadataResolver } from "@/services/session/read-summary";
import { SessionReadSummaryHelpers } from "@/services/session/read-summary";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_metadata (
      session_id TEXT PRIMARY KEY,
      title TEXT,
      continuity_key TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function buildResolver(db: Database): SessionMetadataResolver {
  return {
    metadata: (sessionId) => {
      const row = db
        .query(
          `
            SELECT title, continuity_key as continuityKey
            FROM session_metadata
            WHERE session_id = ?1
          `,
        )
        .get(sessionId) as {
        title?: string;
        continuityKey?: string;
      } | null;
      return row ?? undefined;
    },
    continuityKeyFor: (sessionId) => {
      return sessionId.split(":").slice(0, 2).join(":") || sessionId;
    },
  };
}

describe("SessionReadSummaryHelpers", () => {
  it("returns summary stats from raw session rows", () => {
    const db = createDb();
    const helpers = new SessionReadSummaryHelpers(db, buildResolver(db));
    db.query(
      `
          INSERT INTO messages (id, session_id, room_id, entity_id, role, text, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        `,
    ).run(
      "1",
      "room:alpha",
      "room:alpha",
      "user:1",
      "user",
      "first",
      "2026-03-20T00:00:00Z",
    );
    db.query(
      `
          INSERT INTO messages (id, session_id, room_id, entity_id, role, text, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        `,
    ).run(
      "2",
      "room:alpha",
      "room:alpha",
      "assistant:1",
      "assistant",
      "second",
      "2026-03-20T00:00:01Z",
    );
    db.query(
      `
          INSERT INTO messages (id, session_id, room_id, entity_id, role, text, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        `,
    ).run(
      "3",
      "room:beta",
      "room:beta",
      "user:2",
      "user",
      "third",
      "2026-03-20T00:00:02Z",
    );

    const summary = helpers.summary(3);
    expect(summary.totalSessions).toBe(2);
    expect(summary.recentSessionIds).toEqual([
      "room:beta",
      "room:alpha",
      "room:alpha",
    ]);

    const alpha = helpers.summarize("room:alpha", 3);
    expect(alpha.messageCount).toBe(2);
    expect(alpha.participants).toContain("user");
    expect(alpha.participants).toContain("assistant");

    const sessions = helpers.listSessions(2);
    expect(sessions.map((session) => session.sessionId)).toEqual([
      "room:beta",
      "room:alpha",
    ]);
  });

  it("resolves titled sessions and computes usage", () => {
    const db = createDb();
    const helpers = new SessionReadSummaryHelpers(db, buildResolver(db));
    db.query(
      `
          INSERT INTO messages (id, session_id, room_id, entity_id, role, text, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        `,
    ).run(
      "1",
      "cli:local-user",
      "cli:local-user",
      "user:1",
      "user",
      "Hello there",
      "2026-03-20T00:00:00.000Z",
    );
    db.query(
      `
          INSERT INTO messages (id, session_id, room_id, entity_id, role, text, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        `,
    ).run(
      "2",
      "cli:local-user",
      "cli:local-user",
      "assistant:1",
      "assistant",
      "General Kenobi",
      "2026-03-20T00:00:01.000Z",
    );
    db.query(
      `
          INSERT INTO session_metadata (
            session_id,
            title,
            continuity_key,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4)
        `,
    ).run(
      "cli:local-user",
      "Main Session",
      "cli:local",
      "2026-03-20T00:00:01.000Z",
    );

    const titled = helpers.listTitled(1);
    expect(titled).toHaveLength(1);
    expect(titled[0]?.title).toBe("Main Session");

    const byTitle = helpers.resolveByTitle("main session");
    expect(byTitle?.sessionId).toBe("cli:local-user");
    expect(byTitle?.title).toBe("Main Session");

    const usage = helpers.usage("cli:local-user");
    expect(usage.messageCount).toBe(2);
    expect(usage.userMessages).toBe(1);
    expect(usage.assistantMessages).toBe(1);
    expect(usage.estimatedTokens).toBeGreaterThan(0);
  });

  it("returns continuity sessions by continuity key", () => {
    const db = createDb();
    const helpers = new SessionReadSummaryHelpers(db, buildResolver(db));
    db.query(
      `
          INSERT INTO session_metadata (
            session_id,
            title,
            continuity_key,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4)
        `,
    ).run("chat:a", "Alpha", "chat:a", "2026-03-20T00:00:00.000Z");
    db.query(
      `
          INSERT INTO session_metadata (
            session_id,
            title,
            continuity_key,
            updated_at
          )
          VALUES (?1, ?2, ?3, ?4)
        `,
    ).run("chat:a:1", "Continuation", "chat:a", "2026-03-20T00:00:01.000Z");

    const continuity = helpers.continuity("chat:a:1", 5);
    expect(continuity).toHaveLength(2);
    expect(continuity[0]?.sessionId).toBe("chat:a:1");
  });
});
