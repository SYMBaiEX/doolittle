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

      const sessions = service.listSessions(10);
      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.sessionId).toBe("room:beta");
      expect(sessions[1]?.sessionId).toBe("room:alpha");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
