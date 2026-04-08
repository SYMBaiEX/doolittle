import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import type { SessionSummary } from "@/types";
import { SessionMetadataStore } from "./store";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE session_metadata (
      session_id TEXT PRIMARY KEY,
      title TEXT,
      continuity_key TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("session/metadata/store", () => {
  it("renames sessions and resolves continuity metadata", () => {
    const db = createDb();
    const summaries = new Map<string, SessionSummary>();
    const store = new SessionMetadataStore(db, {
      summarize(sessionId, limit) {
        return (
          summaries.get(sessionId) ?? {
            sessionId,
            messageCount: limit ?? 0,
            participants: [],
            preview: [],
          }
        );
      },
      continuityKeyFor(sessionId) {
        return sessionId.split(":").slice(0, 2).join(":") || sessionId;
      },
    });

    summaries.set("room:1", {
      sessionId: "room:1",
      title: "Primary",
      continuityKey: "room:1",
      messageCount: 1,
      participants: ["user"],
      preview: ["[user] Hello"],
    });

    const renamed = store.rename("room:1", " Primary ");
    expect(renamed.title).toBe("Primary");
    expect(store.metadata("room:1")?.title).toBe("Primary");
    expect(store.continuityKey("room:1")).toBe("room:1");
    expect(store.continuity("room:1")).toHaveLength(1);
  });
});
