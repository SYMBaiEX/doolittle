import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LongTermMemoryCategory } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { SessionService } from "./service";
import type { SessionForkError } from "./service/write";

describe("SessionService", () => {
  it("summarizes sessions and lists recent session summaries", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-session-"));
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
    const root = mkdtempSync(join(tmpdir(), "doolittle-session-usage-"));
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

  it("persists projects, resources, and session movement without changing unscoped sessions", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-session-projects-"));
    const service = new SessionService(root);
    try {
      service.storeMessage({
        id: "a",
        sessionId: "room:alpha",
        roomId: "room:alpha",
        entityId: "user:1",
        role: "user",
        text: "alpha",
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      service.storeMessage({
        id: "b",
        sessionId: "room:beta",
        roomId: "room:beta",
        entityId: "user:1",
        role: "user",
        text: "beta",
        createdAt: "2026-03-20T00:00:01.000Z",
      });
      const project = service.createProject({
        id: "project-1",
        name: "Launch",
        description: "Release work",
      });
      expect(service.listProjects()).toEqual([project]);
      expect(
        service.addProjectResource(project.id, {
          id: "resource-1",
          kind: "source",
          label: "Repository",
          value: "/tmp/repo",
        })?.projectId,
      ).toBe(project.id);
      expect(service.assignSessionProject("room:alpha", project.id)).toBe(true);
      expect(service.listSessions(10).map((entry) => entry.sessionId)).toEqual([
        "room:beta",
        "room:alpha",
      ]);
      expect(
        service.listSessions(10, project.id).map((entry) => entry.sessionId),
      ).toEqual(["room:alpha"]);
      expect(service.summarize("room:alpha").projectId).toBe(project.id);
      expect(service.usage("room:alpha").projectId).toBe(project.id);
      expect(service.assignSessionProject("room:alpha")).toBe(true);
      expect(service.summarize("room:alpha").projectId).toBeUndefined();
      expect(service.archiveProject(project.id)?.archivedAt).toBeDefined();
      expect(service.assignSessionProject("room:beta", project.id)).toBe(false);
      expect(
        service.archiveProject(project.id, false)?.archivedAt,
      ).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("forks full and bounded transcripts without mutating the source", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-session-forks-"));
    const service = new SessionService(root);
    try {
      const project = service.createProject({
        id: "project-forks",
        name: "Fork work",
      });
      for (const [index, text] of ["first", "second", "third"].entries()) {
        service.storeMessage({
          id: `source-${index + 1}`,
          sessionId: "source",
          roomId: "source",
          entityId: index % 2 === 0 ? "user:1" : "assistant:1",
          role: index % 2 === 0 ? "user" : "assistant",
          text,
          attachments:
            index === 0
              ? [
                  {
                    id: "attachment-1",
                    name: "brief.md",
                    kind: "document",
                    mimeType: "text/markdown",
                    sizeBytes: 12,
                    sha256: "b".repeat(64),
                  },
                ]
              : undefined,
          createdAt: `2026-03-20T00:00:0${index}.000Z`,
        });
      }
      expect(service.assignSessionProject("source", project.id)).toBe(true);
      service.rename("source", "Source title");
      const sourceBefore = service.messagesBySession("source", 10);

      const full = service.forkSession({ sourceSessionId: "source" });
      expect(full).toMatchObject({
        sourceSessionId: "source",
        parentSessionId: "source",
        forkedFromMessageId: "source-3",
        rootSessionId: "source",
        boundaryMode: "full",
        copiedMessageCount: 3,
        projectId: project.id,
        summary: { title: "Source title" },
      });
      expect(full.sessionId).toMatch(/^fork:/);
      expect(service.messagesBySession("source", 10)).toEqual(sourceBefore);
      expect(
        service.messagesBySession(full.sessionId, 10).map((message) => ({
          originMessageId: message.originMessageId,
          role: message.role,
          text: message.text,
          attachments: message.attachments,
          createdAt: message.createdAt,
        })),
      ).toEqual(
        sourceBefore.map((message) => ({
          originMessageId: message.id,
          role: message.role,
          text: message.text,
          attachments: message.attachments,
          createdAt: message.createdAt,
        })),
      );

      const prefix = service.forkSession({
        sourceSessionId: "source",
        throughMessageId: "source-2",
      });
      expect(prefix).toMatchObject({
        forkedFromMessageId: "source-2",
        boundaryMode: "through",
        copiedMessageCount: 2,
      });
      expect(
        service
          .messagesBySession(prefix.sessionId, 10)
          .map((message) => message.text),
      ).toEqual(["first", "second"]);
      expect(service.metadata(prefix.sessionId)).toMatchObject({
        parentSessionId: "source",
        forkedFromMessageId: "source-2",
        rootSessionId: "source",
      });
      expect(service.summarize(prefix.sessionId)).toMatchObject({
        parentSessionId: "source",
        forkedFromMessageId: "source-2",
        rootSessionId: "source",
      });
      expect(
        new Set(
          service
            .continuity(prefix.sessionId)
            .map((summary) => summary.sessionId),
        ),
      ).toEqual(new Set(["source", full.sessionId, prefix.sessionId]));

      const nested = service.forkSession({
        sourceSessionId: prefix.sessionId,
      });
      expect(nested).toMatchObject({
        parentSessionId: prefix.sessionId,
        rootSessionId: "source",
        copiedMessageCount: 2,
      });
      expect(service.metadata(nested.sessionId)).toMatchObject({
        parentSessionId: prefix.sessionId,
        rootSessionId: "source",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("supports non-destructive before-message forks, including an empty prefix", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-session-before-fork-"));
    const service = new SessionService(root);
    try {
      for (const [index, text] of ["original prompt", "answer"].entries()) {
        service.storeMessage({
          id: `turn-${index + 1}`,
          sessionId: "edit-source",
          roomId: "edit-source",
          entityId: index === 0 ? "user:1" : "assistant:1",
          role: index === 0 ? "user" : "assistant",
          text,
          createdAt: `2026-03-20T00:00:0${index}.000Z`,
        });
      }

      const empty = service.forkSession({
        sourceSessionId: "edit-source",
        beforeMessageId: "turn-1",
      });
      expect(empty).toMatchObject({
        forkedFromMessageId: "turn-1",
        boundaryMode: "before",
        copiedMessageCount: 0,
      });
      expect(empty.copiedThroughMessageId).toBeUndefined();
      expect(service.messagesBySession(empty.sessionId, 10)).toEqual([]);

      const beforeAnswer = service.forkSession({
        sourceSessionId: "edit-source",
        beforeMessageId: "turn-2",
      });
      expect(beforeAnswer.copiedMessageCount).toBe(1);
      expect(beforeAnswer.copiedThroughMessageId).toBe("turn-1");
      expect(
        service.messagesBySession(beforeAnswer.sessionId, 10)[0]
          ?.originMessageId,
      ).toBe("turn-1");
      expect(
        service
          .messagesBySession("edit-source", 10)
          .map((message) => message.id),
      ).toEqual(["turn-1", "turn-2"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects invalid fork sources and boundaries cleanly", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-session-fork-errors-"));
    const service = new SessionService(root);
    try {
      expect(() =>
        service.forkSession({ sourceSessionId: "missing" }),
      ).toThrowError(
        expect.objectContaining<Partial<SessionForkError>>({
          code: "source_not_found",
        }),
      );
      service.storeMessage({
        id: "known-message",
        sessionId: "known",
        roomId: "known",
        entityId: "user:1",
        role: "user",
        text: "known",
        createdAt: "2026-03-20T00:00:00.000Z",
      });
      expect(() =>
        service.forkSession({
          sourceSessionId: "known",
          throughMessageId: "missing-message",
        }),
      ).toThrowError(
        expect.objectContaining<Partial<SessionForkError>>({
          code: "boundary_not_found",
        }),
      );
      expect(() =>
        service.forkSession({
          sourceSessionId: "known",
          throughMessageId: "known-message",
          beforeMessageId: "known-message",
        }),
      ).toThrowError(
        expect.objectContaining<Partial<SessionForkError>>({
          code: "invalid_boundary",
        }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects transcript prefixes that exceed the bounded fork limit", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-session-fork-limit-"));
    const service = new SessionService(root);
    try {
      for (let index = 0; index < 501; index += 1) {
        service.storeMessage({
          id: `message-${index}`,
          sessionId: "large-source",
          roomId: "large-source",
          entityId: "user:1",
          role: "user",
          text: `message ${index}`,
          createdAt: new Date(Date.UTC(2026, 2, 20, 0, 0, index)).toISOString(),
        });
      }
      expect(() =>
        service.forkSession({ sourceSessionId: "large-source" }),
      ).toThrowError(
        expect.objectContaining<Partial<SessionForkError>>({
          code: "transcript_too_large",
        }),
      );
      expect(service.listSessions(100)).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists advanced long-term memories and session summaries", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-session-advanced-"));
    const service = new SessionService(root);

    try {
      const memory = await service.storeLongTermMemory({
        agentId: "agent-1",
        entityId: "entity-1",
        category: LongTermMemoryCategory.SEMANTIC,
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
