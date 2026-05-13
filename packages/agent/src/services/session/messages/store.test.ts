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

  it("deletes the latest conversational exchange while preserving later slash commands", () => {
    const db = createDb();
    const store = new SessionMessageStore(db, new EventEmitter());
    const base = {
      sessionId: "room:1",
      roomId: "room:1",
      entityId: "user:1",
    };

    store.storeMessage({
      ...base,
      id: "1",
      role: "user",
      text: "Build the thing",
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    store.storeMessage({
      ...base,
      id: "2",
      role: "assistant",
      text: "Built it.",
      createdAt: "2026-03-20T00:00:01.000Z",
    });
    store.storeMessage({
      ...base,
      id: "3",
      role: "user",
      text: "/usage",
      createdAt: "2026-03-20T00:00:02.000Z",
    });
    store.storeMessage({
      ...base,
      id: "4",
      role: "assistant",
      text: "Usage summary.",
      createdAt: "2026-03-20T00:00:03.000Z",
    });

    const result = store.deleteLatestExchange("room:1", {
      skipSlashCommands: true,
    });

    expect(result.userMessage?.text).toBe("Build the thing");
    expect(result.assistantMessages.map((message) => message.text)).toEqual([
      "Built it.",
    ]);
    expect(result.deletedMessages).toBe(2);
    expect(store.recentBySession("room:1", 10).map((row) => row.text)).toEqual(
      ["/usage", "Usage summary."].reverse(),
    );
    expect(store.search("Built", 10)).toHaveLength(0);
    expect(store.search("Usage", 10)).toHaveLength(2);
  });

  it("replaces a session transcript and keeps search indexes in sync", () => {
    const db = createDb();
    const store = new SessionMessageStore(db, new EventEmitter());
    const base = {
      sessionId: "room:1",
      roomId: "room:1",
      entityId: "user:1",
    };

    store.storeMessage({
      ...base,
      id: "old-1",
      role: "user",
      text: "obsolete turn",
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    store.storeMessage({
      ...base,
      id: "old-2",
      role: "assistant",
      text: "obsolete reply",
      createdAt: "2026-03-20T00:00:01.000Z",
    });

    store.replaceSessionMessages("room:1", [
      {
        ...base,
        id: "new-1",
        role: "system",
        text: "compressed summary",
        createdAt: "2026-03-20T00:00:02.000Z",
      },
    ]);

    expect(
      store.messagesBySession("room:1", 10).map((row) => row.text),
    ).toEqual(["compressed summary"]);
    expect(store.search("obsolete", 10)).toHaveLength(0);
    expect(store.search("compressed", 10)).toHaveLength(1);
  });
});
