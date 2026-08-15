import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  NodeSessionDatabase as Database,
  type SessionDatabase,
  type SessionStatement,
} from "@/services/session/database";
import { migrateSessionDatabase } from "@/services/session/schema";
import { ProjectStore } from "../projects/store";
import { SessionMessageStore } from "./store";

function createDb(): Database {
  const db = new Database(":memory:");
  migrateSessionDatabase(db);
  return db;
}

class FaultInjectingSessionDatabase implements SessionDatabase {
  private deletedMessages = false;

  constructor(private readonly delegate: SessionDatabase) {}

  exec(sql: string): void {
    this.delegate.exec(sql);
  }

  query(sql: string): SessionStatement {
    const statement = this.delegate.query(sql);
    const isMessageDelete = sql.includes("DELETE FROM messages WHERE rowid IN");
    const isFtsInsert = sql.includes("INSERT INTO messages_fts");
    return {
      all: (...params) => statement.all(...params),
      get: (...params) => statement.get(...params),
      run: (...params) => {
        if (isFtsInsert && this.deletedMessages) {
          throw new Error("Injected messages_fts insertion failure");
        }
        const result = statement.run(...params);
        if (isMessageDelete) {
          this.deletedMessages = true;
        }
        return result;
      },
    };
  }

  close(): void {
    this.delegate.close();
  }
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

  it("returns the assigned project for global search results", () => {
    const db = createDb();
    const store = new SessionMessageStore(db, new EventEmitter());
    const projects = new ProjectStore(db);
    const project = projects.create({ id: "project-search", name: "Search" });
    projects.assignSession("room:project-search", project.id);
    store.storeMessage({
      id: "project-search-message",
      sessionId: "room:project-search",
      roomId: "room:project-search",
      entityId: "user:1",
      role: "user",
      text: "Find the archived deployment",
      createdAt: "2026-03-20T00:00:00.000Z",
    });

    expect(store.search("archived", 10)).toEqual([
      expect.objectContaining({
        sessionId: "room:project-search",
        projectId: "project-search",
      }),
    ]);
  });

  it("round-trips safe attachment descriptors without path or inline data", () => {
    const db = createDb();
    const store = new SessionMessageStore(db, new EventEmitter());
    store.storeMessage({
      id: "attachment-message",
      sessionId: "room:attachments",
      roomId: "room:attachments",
      entityId: "user:1",
      role: "user",
      text: "Review this file",
      attachments: [
        {
          id: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
          name: "review.md",
          kind: "document",
          mimeType: "text/markdown",
          sizeBytes: 42,
          sha256: "a".repeat(64),
        },
      ],
      createdAt: "2026-03-20T00:00:00.000Z",
    });

    const [message] = store.messagesBySession("room:attachments", 10);
    expect(message?.attachments).toEqual([
      {
        id: "62df6968-19be-4ea6-b7a1-479a57fa3b7c",
        name: "review.md",
        kind: "document",
        mimeType: "text/markdown",
        sizeBytes: 42,
        sha256: "a".repeat(64),
      },
    ]);
    expect(JSON.stringify(message)).not.toContain("/Users/");
    expect(JSON.stringify(message)).not.toContain("\\Users\\");
    expect(JSON.stringify(message)).not.toContain("_data");
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

  it("pages a chronological session transcript without dropping earlier rows", () => {
    const db = createDb();
    const store = new SessionMessageStore(db, new EventEmitter());
    for (let index = 0; index < 3; index += 1) {
      store.storeMessage({
        id: `page-${index}`,
        sessionId: "room:page",
        roomId: "room:page",
        entityId: "user:1",
        role: "user",
        text: `message-${index}`,
        createdAt: `2026-03-20T00:00:0${index}.000Z`,
      });
    }

    expect(
      store.messagesBySession("room:page", 2, 1).map((row) => row.text),
    ).toEqual(["message-1", "message-2"]);
  });

  it("rolls back a replacement and withholds activity when insertion fails", () => {
    const db = createDb();
    const events = new EventEmitter();
    const seedStore = new SessionMessageStore(db, events);
    seedStore.storeMessage({
      id: "old-1",
      sessionId: "room:1",
      roomId: "room:1",
      entityId: "user:1",
      role: "user",
      text: "preserved transcript",
      createdAt: "2026-03-20T00:00:00.000Z",
    });
    db.query(
      `
        INSERT INTO message_origins (
          message_id, origin_message_id, source_session_id, created_at
        )
        VALUES (?1, ?2, ?3, ?4)
      `,
    ).run("old-1", "source-1", "source", "2026-03-20T00:00:00.000Z");

    const store = new SessionMessageStore(
      new FaultInjectingSessionDatabase(db),
      events,
    );
    const activity: unknown[] = [];
    store.onActivity((event) => {
      activity.push(event);
    });

    expect(() =>
      store.replaceSessionMessages("room:1", [
        {
          id: "new-1",
          sessionId: "room:1",
          roomId: "room:1",
          entityId: "assistant:1",
          role: "assistant",
          text: "replacement transcript",
          createdAt: "2026-03-20T00:00:01.000Z",
        },
      ]),
    ).toThrow("Injected messages_fts insertion failure");

    expect(store.messagesBySession("room:1", 10)).toMatchObject([
      {
        id: "old-1",
        text: "preserved transcript",
        originMessageId: "source-1",
      },
    ]);
    expect(store.search("preserved", 10)).toHaveLength(1);
    expect(store.search("replacement", 10)).toHaveLength(0);
    expect(activity).toEqual([]);
  });

  it("reads inclusive and exclusive transcript prefixes and records message origins", () => {
    const db = createDb();
    const store = new SessionMessageStore(db, new EventEmitter());
    for (const [index, text] of ["one", "two", "three"].entries()) {
      store.storeMessage({
        id: `source-${index + 1}`,
        sessionId: "source",
        roomId: "source",
        entityId: "user:1",
        role: index % 2 === 0 ? "user" : "assistant",
        text,
        createdAt: `2026-03-20T00:00:0${index}.000Z`,
      });
    }

    expect(
      store
        .transcriptPrefix(
          "source",
          { mode: "through", messageId: "source-2" },
          10,
        )
        .messages.map((message) => message.id),
    ).toEqual(["source-1", "source-2"]);
    const beforeFirst = store.transcriptPrefix(
      "source",
      { mode: "before", messageId: "source-1" },
      10,
    );
    expect(beforeFirst.messages).toEqual([]);
    expect(beforeFirst.boundaryMessageId).toBe("source-1");

    let nextId = 0;
    const copied = store.copyMessagesToSession(
      "source",
      "child",
      store.transcriptPrefix("source", { mode: "full" }, 10).messages,
      () => `copy-${++nextId}`,
    );
    expect(copied.map((message) => message.id)).toEqual([
      "copy-1",
      "copy-2",
      "copy-3",
    ]);
    expect(
      store.messagesBySession("child", 10).map((message) => ({
        id: message.id,
        originMessageId: message.originMessageId,
        text: message.text,
        createdAt: message.createdAt,
      })),
    ).toEqual([
      {
        id: "copy-1",
        originMessageId: "source-1",
        text: "one",
        createdAt: "2026-03-20T00:00:00.000Z",
      },
      {
        id: "copy-2",
        originMessageId: "source-2",
        text: "two",
        createdAt: "2026-03-20T00:00:01.000Z",
      },
      {
        id: "copy-3",
        originMessageId: "source-3",
        text: "three",
        createdAt: "2026-03-20T00:00:02.000Z",
      },
    ]);
  });
});
