import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, it } from "bun:test";
import { migrateSessionDatabase } from "../schema";
import { SessionAdvancedMemoryStore } from "./store";

describe("session/advanced-memory/store", () => {
  let db: Database;
  let store: SessionAdvancedMemoryStore;

  beforeEach(() => {
    db = new Database(":memory:");
    migrateSessionDatabase(db);
    store = new SessionAdvancedMemoryStore(db);
  });

  describe("long-term memories", () => {
    it("stores a memory and returns it with generated id and timestamps", async () => {
      const m = await store.storeLongTermMemory({
        agentId: "agent-1",
        entityId: "entity-1",
        category: "semantic",
        content: "Prefers dark mode.",
      });
      expect(m.id).toBeTruthy();
      expect(m.accessCount).toBe(0);
      expect(m.createdAt).toBeInstanceOf(Date);
    });

    it("retrieves memories and increments access count", async () => {
      await store.storeLongTermMemory({
        agentId: "a",
        entityId: "e",
        category: "semantic",
        content: "Prefers dark mode.",
      });
      const results = await store.getLongTermMemories("a", "e");
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("Prefers dark mode.");
      expect(results[0].accessCount).toBe(1);
      expect(results[0].lastAccessedAt).toBeInstanceOf(Date);
    });

    it("filters by category", async () => {
      await store.storeLongTermMemory({
        agentId: "a",
        entityId: "e",
        category: "semantic",
        content: "Semantic fact.",
      });
      await store.storeLongTermMemory({
        agentId: "a",
        entityId: "e",
        category: "episodic",
        content: "Episodic event.",
      });
      const semantic = await store.getLongTermMemories("a", "e", {
        category: "semantic",
      });
      expect(semantic).toHaveLength(1);
      expect(semantic[0].category).toBe("semantic");
    });

    it("respects the limit option", async () => {
      for (let i = 0; i < 5; i++) {
        await store.storeLongTermMemory({
          agentId: "a",
          entityId: "e",
          category: "semantic",
          content: `item-${i}`,
        });
      }
      const results = await store.getLongTermMemories("a", "e", { limit: 3 });
      expect(results).toHaveLength(3);
    });

    it("updates a memory field", async () => {
      const m = await store.storeLongTermMemory({
        agentId: "a",
        entityId: "e",
        category: "semantic",
        content: "Old content.",
      });
      await store.updateLongTermMemory(m.id, "a", "e", {
        content: "New content.",
      });
      const [updated] = await store.getLongTermMemories("a", "e");
      expect(updated.content).toBe("New content.");
    });

    it("deletes a memory", async () => {
      const m = await store.storeLongTermMemory({
        agentId: "a",
        entityId: "e",
        category: "semantic",
        content: "Gone.",
      });
      await store.deleteLongTermMemory(m.id, "a", "e");
      const results = await store.getLongTermMemories("a", "e");
      expect(results).toHaveLength(0);
    });

    it("does not return memories for a different entity", async () => {
      await store.storeLongTermMemory({
        agentId: "a",
        entityId: "e1",
        category: "semantic",
        content: "E1 content.",
      });
      const results = await store.getLongTermMemories("a", "e2");
      expect(results).toHaveLength(0);
    });
  });

  describe("session summaries", () => {
    const baseSummary = () => ({
      agentId: "agent-1",
      roomId: "room-1",
      summary: "Discussed defaults.",
      messageCount: 5,
      lastMessageOffset: 5,
      startTime: new Date("2026-01-01T00:00:00Z"),
      endTime: new Date("2026-01-01T00:05:00Z"),
    });

    it("stores a summary and returns it with generated id", async () => {
      const s = await store.storeSessionSummary(baseSummary());
      expect(s.id).toBeTruthy();
      expect(s.createdAt).toBeInstanceOf(Date);
    });

    it("retrieves the most recent summary", async () => {
      await store.storeSessionSummary(baseSummary());
      const current = await store.getCurrentSessionSummary("agent-1", "room-1");
      expect(current?.summary).toBe("Discussed defaults.");
    });

    it("returns null when no summary exists", async () => {
      const result = await store.getCurrentSessionSummary("unknown", "unknown");
      expect(result).toBeNull();
    });

    it("updates a summary field", async () => {
      const s = await store.storeSessionSummary(baseSummary());
      await store.updateSessionSummary(s.id, "agent-1", "room-1", {
        summary: "Updated summary.",
      });
      const current = await store.getCurrentSessionSummary("agent-1", "room-1");
      expect(current?.summary).toBe("Updated summary.");
    });

    it("retrieves multiple summaries ordered by end_time desc", async () => {
      await store.storeSessionSummary({
        ...baseSummary(),
        endTime: new Date("2026-01-01T00:05:00Z"),
        summary: "First",
      });
      await store.storeSessionSummary({
        ...baseSummary(),
        endTime: new Date("2026-01-01T00:10:00Z"),
        summary: "Second",
      });
      const summaries = await store.getSessionSummaries("agent-1", "room-1");
      expect(summaries[0].summary).toBe("Second");
      expect(summaries[1].summary).toBe("First");
    });

    it("respects the limit parameter", async () => {
      for (let i = 0; i < 4; i++) {
        await store.storeSessionSummary({
          ...baseSummary(),
          endTime: new Date(`2026-01-01T00:0${i}:00Z`),
        });
      }
      const results = await store.getSessionSummaries("agent-1", "room-1", 2);
      expect(results).toHaveLength(2);
    });
  });
});
