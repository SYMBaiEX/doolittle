import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { SessionMessageStore } from "./store";

function createDb(): Database {
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
    CREATE VIRTUAL TABLE messages_fts USING fts5(
      session_id,
      room_id,
      entity_id,
      role,
      text,
      created_at
    );
  `);
  return db;
}

describe("session/messages/store", () => {
  it("stores messages, emits activity, and supports search helpers", () => {
    const db = createDb();
    const events = new EventEmitter();
    const store = new SessionMessageStore(db, events);
    const activity: unknown[] = [];
    store.onActivity((event) => {
      activity.push(event);
    });

    store.storeMessage({
      id: "1",
      sessionId: "room:1",
      roomId: "room:1",
      entityId: "user:1",
      role: "user",
      text: "Hello session search",
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    store.storeMessage({
      id: "2",
      sessionId: "room:1",
      roomId: "room:1",
      entityId: "assistant:1",
      role: "assistant",
      text: "Replying to the session search",
      createdAt: "2026-03-20T00:00:01.000Z",
    });

    expect(activity).toHaveLength(2);
    expect(store.search("session", 10)).toHaveLength(2);
    expect(store.recentBySession("room:1", 1)[0]?.role).toBe("assistant");
    expect(store.countBySessionRole("room:1", "assistant")).toBe(1);
    expect(store.latest(1)[0]?.text).toBe("Replying to the session search");
  });
});
