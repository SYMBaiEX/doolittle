import { describe, expect, it } from "vitest";
import { NodeSessionDatabase as Database } from "@/services/session/database";
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
    expect(usage.context).toMatchObject({
      sampledMessages: 2,
      totalMessages: 2,
      truncated: false,
      estimated: true,
    });
  });

  it("uses the requested model window and safely handles empty sessions", () => {
    const db = createDb();
    const helpers = new SessionReadSummaryHelpers(db, buildResolver(db));

    const empty = helpers.usage("missing", {
      provider: "openai",
      model: "gpt-5.4",
    });
    expect(empty).toMatchObject({
      messageCount: 0,
      estimatedTokens: 0,
      context: {
        estimatedTokens: 0,
        contextWindowTokens: 1_050_000,
        usageFraction: 0,
        percent: 0,
        overThreshold: false,
        sampledMessages: 0,
        totalMessages: 0,
        truncated: false,
        provider: "openai",
        model: "gpt-5.4",
      },
    });

    db.query(
      `
        INSERT INTO messages (
          id, session_id, room_id, entity_id, role, text, created_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      `,
    ).run(
      "1",
      "session:model",
      "session:model",
      "user:1",
      "user",
      "hello",
      "2026-03-20T00:00:00.000Z",
    );

    const smallWindow = helpers.usage("session:model", {
      provider: "openai",
      model: "gpt-4",
    });
    const largeWindow = helpers.usage("session:model", {
      provider: "openai",
      model: "gpt-5.4",
    });
    expect(smallWindow.context?.contextWindowTokens).toBe(8_192);
    expect(largeWindow.context?.contextWindowTokens).toBe(1_050_000);
    expect(smallWindow.context?.usageFraction ?? 0).toBeGreaterThan(
      largeWindow.context?.usageFraction ?? 0,
    );
  });

  it("builds analytics with one bounded aggregate projection", () => {
    const db = createDb();
    const helpers = new SessionReadSummaryHelpers(db, buildResolver(db));
    const insert = db.query(`
      INSERT INTO messages (
        id, session_id, room_id, entity_id, role, text, created_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `);
    insert.run(
      "1",
      "session:older",
      "session:older",
      "user:1",
      "user",
      "older prompt",
      "2026-03-19T00:00:00.000Z",
    );
    insert.run(
      "2",
      "session:newer",
      "session:newer",
      "user:1",
      "user",
      "new prompt",
      "2026-03-20T00:00:00.000Z",
    );
    insert.run(
      "3",
      "session:newer",
      "session:newer",
      "assistant:1",
      "assistant",
      "new response",
      "2026-03-20T00:00:01.000Z",
    );
    db.query(
      `
        INSERT INTO session_metadata (
          session_id, title, continuity_key, updated_at
        ) VALUES (?1, ?2, ?3, ?4)
      `,
    ).run(
      "session:newer",
      "New session",
      "session:newer",
      "2026-03-20T00:00:01.000Z",
    );

    const analytics = helpers.analytics(10, 1);

    expect(analytics.totals).toEqual({
      sessions: 2,
      messages: 3,
      estimatedTokens: 9,
      userMessages: 2,
      assistantMessages: 1,
      systemMessages: 0,
    });
    expect(analytics.recentSessions).toEqual([
      expect.objectContaining({
        sessionId: "session:newer",
        title: "New session",
        messageCount: 2,
        estimatedTokens: 6,
        lastPreview: "new response",
      }),
    ]);
    expect(analytics.dailyActivity).toEqual([
      {
        date: "2026-03-19",
        sessions: 1,
        messages: 1,
        estimatedTokens: 3,
      },
      {
        date: "2026-03-20",
        sessions: 1,
        messages: 2,
        estimatedTokens: 6,
      },
    ]);
  });

  it("bounds the sample and display percent while retaining overflow pressure", () => {
    const db = createDb();
    const helpers = new SessionReadSummaryHelpers(db, buildResolver(db));
    const insert = db.query(`
      INSERT INTO messages (
        id, session_id, room_id, entity_id, role, text, created_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `);

    insert.run(
      "1",
      "session:large",
      "session:large",
      "user:1",
      "user",
      "old",
      "2026-03-20T00:00:00.000Z",
    );
    insert.run(
      "2",
      "session:large",
      "session:large",
      "assistant:1",
      "assistant",
      "x".repeat(20_000),
      "2026-03-20T00:00:01.000Z",
    );
    insert.run(
      "3",
      "session:large",
      "session:large",
      "user:1",
      "user",
      "y".repeat(20_000),
      "2026-03-20T00:00:02.000Z",
    );

    const usage = helpers.usage("session:large", {
      provider: "openai",
      model: "gpt-4",
      sampleLimit: 2,
      threshold: 0.5,
    });

    expect(usage.context?.totalMessages).toBe(3);
    expect(usage.context?.sampledMessages).toBe(2);
    expect(usage.context?.truncated).toBe(true);
    expect(usage.context?.estimatedTokens).toBeGreaterThan(8_192);
    expect(usage.context?.usageFraction).toBeGreaterThan(1);
    expect(usage.context?.percent).toBe(100);
    expect(usage.context?.overThreshold).toBe(true);
    expect(usage.lastPreview).toBe("y".repeat(200));
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
