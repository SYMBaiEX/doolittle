import { EventEmitter } from "node:events";
import { expect, it } from "vitest";
import { NodeSessionDatabase } from "../../packages/agent/src/services/session/database";
import { SessionMessageStore } from "../../packages/agent/src/services/session/messages";
import { migrateSessionDatabase } from "../../packages/agent/src/services/session/schema";
import { collectTrajectoryRecords } from "../../packages/agent/src/services/trajectory/bundle-storage";
import type { StoredMessage } from "../../packages/agent/src/types";

it("limits trajectory messages after filtering by session and role", () => {
  const db = new NodeSessionDatabase(":memory:");
  try {
    migrateSessionDatabase(db);
    const sessions = new SessionMessageStore(db, new EventEmitter());
    const addMessage = (
      second: number,
      sessionId: string,
      role: StoredMessage["role"],
      text: string,
    ) => {
      sessions.storeMessage({
        id: String(second),
        sessionId,
        roomId: sessionId,
        entityId: sessionId,
        role,
        text,
        createdAt: new Date(second * 1_000).toISOString(),
      });
    };
    addMessage(1, "selected", "user", "matching message");
    addMessage(2, "selected", "assistant", "wrong role");
    addMessage(3, "other", "user", "wrong session");

    const records = collectTrajectoryRecords(
      { sessions, baseDir: ".", slug: (value) => value },
      { sessionId: "selected", role: "user", limit: 1 },
    );
    expect(records.map(({ text }) => text)).toEqual(["matching message"]);
  } finally {
    db.close();
  }
});
