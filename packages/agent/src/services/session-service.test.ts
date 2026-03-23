import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionService } from "./session-service";

describe("SessionService", () => {
  it("summarizes sessions and lists recent session summaries", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-session-"));
    const service = new SessionService(root);

    try {
      service.storeMessage({
        id: "1",
        sessionId: "room:alpha",
        roomId: "room:alpha",
        entityId: "user:1",
        role: "user",
        text: "Hello there",
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      service.storeMessage({
        id: "2",
        sessionId: "room:alpha",
        roomId: "room:alpha",
        entityId: "assistant:1",
        role: "assistant",
        text: "Hi, how can I help?",
        createdAt: "2026-03-20T00:00:01.000Z",
      });
      service.storeMessage({
        id: "3",
        sessionId: "room:beta",
        roomId: "room:beta",
        entityId: "user:2",
        role: "user",
        text: "Different room",
        createdAt: "2026-03-20T00:00:02.000Z",
      });

      const summary = service.summarize("room:alpha");
      expect(summary.messageCount).toBe(2);
      expect(summary.participants).toContain("user");
      expect(summary.participants).toContain("assistant");
      expect(summary.preview[0]).toContain("Hello there");

      const renamed = service.rename("room:alpha", "Alpha Session");
      expect(renamed.title).toBe("Alpha Session");
      expect(renamed.continuityKey).toBe("room:alpha");
      expect(service.metadata("room:alpha")?.title).toBe("Alpha Session");

      const sessions = service.listSessions(10);
      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.sessionId).toBe("room:beta");
      expect(sessions[1]?.sessionId).toBe("room:alpha");
      expect(sessions[1]?.title).toBe("Alpha Session");
      expect(service.continuity("room:alpha")).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves titled sessions and reports usage", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-session-usage-"));
    const service = new SessionService(root);

    try {
      service.storeMessage({
        id: "u1",
        sessionId: "cli:local-user",
        roomId: "cli:local-user",
        entityId: "user:1",
        role: "user",
        text: "Hello there",
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      service.storeMessage({
        id: "a1",
        sessionId: "cli:local-user",
        roomId: "cli:local-user",
        entityId: "assistant:1",
        role: "assistant",
        text: "General Kenobi",
        createdAt: "2026-03-20T00:00:01.000Z",
      });

      service.rename("cli:local-user", "Main Session");

      const resolved = service.resolveByTitle("main session");
      expect(resolved?.sessionId).toBe("cli:local-user");
      expect(service.listTitled(5)[0]?.title).toBe("Main Session");

      const usage = service.usage("cli:local-user");
      expect(usage.messageCount).toBe(2);
      expect(usage.userMessages).toBe(1);
      expect(usage.assistantMessages).toBe(1);
      expect(usage.estimatedTokens).toBeGreaterThan(0);
      expect(service.countBySessionRole("cli:local-user", "assistant")).toBe(1);
      expect(service.recentBySession("cli:local-user", 5)).toHaveLength(2);
      expect(service.recentBySession("cli:local-user", 1)[0]?.text).toBe(
        "General Kenobi",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists advanced long-term memories and session summaries", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-session-advanced-"));
    const service = new SessionService(root);

    try {
      const memory = await service.storeLongTermMemory({
        agentId: "agent-1",
        entityId: "entity-1",
        category: "semantic",
        content: "The user prefers Eliza Cloud for default runs.",
        metadata: { source: "test" },
        confidence: 0.91,
        source: "unit-test",
      });

      const memories = await service.getLongTermMemories("agent-1", "entity-1");
      expect(memories).toHaveLength(1);
      expect(memories[0]?.id).toBe(memory.id);
      expect(memories[0]?.accessCount).toBeGreaterThan(0);
      expect(memories[0]?.metadata?.source).toBe("test");

      await service.updateLongTermMemory(memory.id, "agent-1", "entity-1", {
        content: "The user prefers Eliza Cloud for managed runs.",
        accessCount: 7,
      });

      const updated = await service.getLongTermMemories("agent-1", "entity-1");
      expect(updated[0]?.content).toContain("managed runs");

      const summary = await service.storeSessionSummary({
        agentId: "agent-1",
        roomId: "room-1",
        entityId: "entity-1",
        summary: "Discussed Cloud login behavior and runtime defaults.",
        messageCount: 8,
        lastMessageOffset: 8,
        startTime: new Date("2026-03-22T00:00:00.000Z"),
        endTime: new Date("2026-03-22T00:05:00.000Z"),
        topics: ["cloud", "runtime"],
        metadata: { test: true },
      });

      const current = await service.getCurrentSessionSummary(
        "agent-1",
        "room-1",
      );
      expect(current?.id).toBe(summary.id);
      expect(current?.topics).toEqual(["cloud", "runtime"]);

      await service.updateSessionSummary(summary.id, "agent-1", "room-1", {
        summary: "Updated summary",
        messageCount: 9,
      });

      const summaries = await service.getSessionSummaries("agent-1", "room-1");
      expect(summaries[0]?.summary).toBe("Updated summary");
      expect(summaries[0]?.messageCount).toBe(9);

      await service.deleteLongTermMemory(memory.id, "agent-1", "entity-1");
      expect(
        await service.getLongTermMemories("agent-1", "entity-1"),
      ).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
