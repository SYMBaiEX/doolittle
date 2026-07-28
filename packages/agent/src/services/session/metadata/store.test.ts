import { describe, expect, it } from "vitest";
import { NodeSessionDatabase as Database } from "@/services/session/database";
import { migrateSessionDatabase } from "@/services/session/schema";
import type { SessionSummary } from "@/types";
import { SessionMetadataStore } from "./store";

function createDb(): Database {
  const db = new Database(":memory:");
  migrateSessionDatabase(db);
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

  it("records immutable lineage and groups unnamed forks with their parent", () => {
    const db = createDb();
    const store = new SessionMetadataStore(db, {
      summarize(sessionId) {
        return {
          sessionId,
          messageCount: 0,
          participants: [],
          preview: [],
        };
      },
      continuityKeyFor(sessionId) {
        return sessionId;
      },
    });

    expect(store.recordFork("parent", "child", "message-2")).toEqual({
      continuityKey: "parent",
      rootSessionId: "parent",
    });
    expect(store.metadata("child")).toMatchObject({
      continuityKey: "parent",
      parentSessionId: "parent",
      forkedFromMessageId: "message-2",
      rootSessionId: "parent",
    });
    store.rename("child", "Child branch");
    expect(store.metadata("child")).toMatchObject({
      title: "Child branch",
      continuityKey: "parent",
    });
    expect(
      new Set(store.continuity("child").map((entry) => entry.sessionId)),
    ).toEqual(new Set(["child", "parent"]));
    expect(() =>
      store.recordFork("other-parent", "child", "other-message"),
    ).toThrow("already exists");
    expect(store.metadata("child")).toMatchObject({
      parentSessionId: "parent",
      forkedFromMessageId: "message-2",
    });
  });
});
