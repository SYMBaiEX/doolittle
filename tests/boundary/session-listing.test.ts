import { expect, it } from "vitest";
import { NodeSessionDatabase } from "../../packages/agent/src/services/session/database";
import { resolveSessionAnalytics } from "../../packages/agent/src/services/session/read-summary/analytics";
import { listSessionSummaries } from "../../packages/agent/src/services/session/read-summary/listing";
import { migrateSessionDatabase } from "../../packages/agent/src/services/session/schema";

it("lists previews, totals and current project bindings for the selected conversations", () => {
  const db = new NodeSessionDatabase(":memory:");
  try {
    migrateSessionDatabase(db);
    const message = db.query(`
      INSERT INTO messages (id, session_id, room_id, entity_id, role, text, created_at)
      VALUES (?1, ?2, ?2, 'entity', ?3, ?4, ?5)
    `);
    const start = "2026-01-01T00:00:00.000Z";
    const end = "2026-01-02T00:00:00.000Z";
    const newest = "2026-01-03T00:00:00.000Z";
    const longText = "x".repeat(201);
    for (let index = 0; index < 6; index++) {
      message.run(
        `fork-${index}`,
        "fork",
        index === 0 ? "user" : "assistant",
        index === 0 ? longText : `reply ${index}`,
        start,
      );
    }
    message.run("fork-last", "fork", "system", "outside preview", end);
    message.run("newest-0", "newest", "user", "newest request", newest);

    db.query(`
      INSERT INTO projects (id, name, created_at, updated_at)
      VALUES ('project', 'Project', ?1, ?1)
    `).run(start);
    db.query(`
      INSERT INTO session_projects (session_id, project_id, updated_at)
      VALUES ('fork', 'project', ?1), ('draft', 'project', ?1)
    `).run(start);
    db.query(`
      INSERT INTO session_metadata (session_id, title, continuity_key, updated_at)
      VALUES ('fork', 'Fork title', 'project:root', ?1), ('draft', 'Draft title', NULL, ?1)
    `).run(start);
    db.query(`
      INSERT INTO session_lineage (session_id, parent_session_id, forked_from_message_id, root_session_id, created_at)
      VALUES ('fork', 'parent', 'source-message', 'root', ?1)
    `).run(start);

    expect(
      listSessionSummaries(db, 10).map(({ sessionId }) => sessionId),
    ).toEqual(["newest", "fork"]);
    expect(listSessionSummaries(db, 1)[0]).toMatchObject({
      sessionId: "newest",
      projectId: undefined,
      title: undefined,
      messageCount: 1,
    });
    expect(listSessionSummaries(db, 10, "project")).toEqual([
      {
        sessionId: "fork",
        title: "Fork title",
        projectId: "project",
        continuityKey: "project:root",
        parentSessionId: "parent",
        forkedFromMessageId: "source-message",
        rootSessionId: "root",
        messageCount: 7,
        startedAt: start,
        endedAt: end,
        participants: ["user", "assistant"],
        preview: [
          `[user] ${longText.slice(0, 200)}`,
          "[assistant] reply 1",
          "[assistant] reply 2",
          "[assistant] reply 3",
          "[assistant] reply 4",
          "[assistant] reply 5",
        ],
      },
    ]);
    db.exec(
      "UPDATE session_metadata SET title = 'Renamed' WHERE session_id = 'fork'",
    );
    expect(listSessionSummaries(db, 10, "project")[0]?.title).toBe("Renamed");
    db.exec("DELETE FROM session_projects WHERE session_id = 'fork'");
    expect(listSessionSummaries(db, 10, "project")).toEqual([]);
  } finally {
    db.close();
  }
});

it("backfills legacy messages once and keeps the inventory current through moves and deletions", () => {
  const db = new NodeSessionDatabase(":memory:");
  try {
    db.exec(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, room_id TEXT NOT NULL,
        entity_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO messages VALUES
        ('a1', 'long', 'room', 'person', 'user', 'first', '2026-10-01'),
        ('a2', 'long', 'room', 'person', 'assistant', 'middle', '2026-10-02'),
        ('a3', 'long', 'room', 'person', 'system', 'last', '2026-10-03'),
        ('b1', 'short', 'room', 'person', 'user', 'newer', '2026-10-04');
    `);
    migrateSessionDatabase(db);
    migrateSessionDatabase(db);
    expect(listSessionSummaries(db, 2)).toMatchObject([
      { sessionId: "short", messageCount: 1 },
      {
        sessionId: "long",
        messageCount: 3,
        startedAt: "2026-10-01",
        endedAt: "2026-10-03",
      },
    ]);
    expect(resolveSessionAnalytics(db, 1)).toMatchObject({
      totals: { sessions: 1, messages: 1, userMessages: 1 },
      recentSessions: [{ sessionId: "short", messageCount: 1 }],
    });

    db.exec(`
      UPDATE messages SET session_id = 'short', created_at = '2026-10-05'
        WHERE id = 'a3';
      UPDATE messages SET created_at = '2026-10-06' WHERE id = 'a2';
      DELETE FROM messages WHERE id IN ('a1', 'b1');
    `);

    expect(listSessionSummaries(db, 2)).toMatchObject([
      {
        sessionId: "long",
        messageCount: 1,
        startedAt: "2026-10-06",
        endedAt: "2026-10-06",
      },
      {
        sessionId: "short",
        messageCount: 1,
        startedAt: "2026-10-05",
        endedAt: "2026-10-05",
      },
    ]);
    db.exec("DELETE FROM messages WHERE session_id = 'short'");
    expect(listSessionSummaries(db, 2)).toMatchObject([{ sessionId: "long" }]);
  } finally {
    db.close();
  }
});

it("rolls back a failed schema upgrade before accepting a retry", () => {
  const db = new NodeSessionDatabase(":memory:");
  try {
    // A conflicting table causes a failure after base DDL has run.
    db.exec("CREATE TABLE session_message_activity (unused TEXT)");
    expect(() => migrateSessionDatabase(db)).toThrow();
    expect(db.query("PRAGMA user_version").get()).toMatchObject({
      user_version: 0,
    });
    expect(db.query("PRAGMA table_info(messages)").all()).toEqual([]);
    db.exec("DROP TABLE session_message_activity");

    migrateSessionDatabase(db);
    expect(listSessionSummaries(db, 5)).toEqual([]);
  } finally {
    db.close();
  }
});
