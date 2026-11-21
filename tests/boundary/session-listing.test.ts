import { expect, it } from "vitest";
import { NodeSessionDatabase } from "../../packages/agent/src/services/session/database";
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
