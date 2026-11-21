import { EventEmitter } from "node:events";
import { expect, it } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/types";
import { handleSessionRoutes } from "../../packages/agent/src/server/routes/sessions";
import { NodeSessionDatabase } from "../../packages/agent/src/services/session/database";
import { SessionMessageStore } from "../../packages/agent/src/services/session/messages";
import { migrateSessionDatabase } from "../../packages/agent/src/services/session/schema";
import type { StoredMessage } from "../../packages/agent/src/types";

it("pages long sessions from the newest end without changing chronological order or saved runs", async () => {
  const db = new NodeSessionDatabase(":memory:");
  try {
    migrateSessionDatabase(db);
    const sessions = new SessionMessageStore(db, new EventEmitter());
    const context = { services: { sessions } } as unknown as AppContext;
    const sessionId = "selected";
    const message = (index: number, owner = sessionId): StoredMessage => ({
      id: `${owner}-${index}`,
      sessionId: owner,
      roomId: owner,
      entityId: owner,
      role: "user",
      text: `Message ${index}`,
      // Timestamps often tie. Their insertion order breaks ties in SQLite.
      createdAt: new Date(Math.floor(index / 6) * 1000).toISOString(),
      ...(index === 1049
        ? {
            attachments: [
              {
                id: "note",
                name: "note.txt",
                mimeType: "text/plain",
                kind: "document",
                sizeBytes: 16,
                sha256: "f".repeat(64),
              },
            ],
          }
        : {}),
    });
    const firstRun = Array.from({ length: 1051 }, (_, i) => message(i));
    const nextRun = Array.from({ length: 37 }, (_, i) =>
      message(i + firstRun.length),
    );
    db.exec("BEGIN");
    for (const row of firstRun) sessions.storeMessage(row);
    for (const index of [0, 1049, 1086])
      sessions.storeMessage(message(index, "other"));
    db.exec("COMMIT");
    sessions.recordRunTerminalBoundary("earlier-run", sessionId, "complete");
    for (const row of nextRun) sessions.storeMessage(row);

    async function page(owner: string, offset: number, throughRunId?: string) {
      const url = new URL("https://localhost/sessions/messages");
      url.searchParams.set("sessionId", owner);
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("limit", "50");
      if (throughRunId) url.searchParams.set("throughRunId", throughRunId);
      const response = await handleSessionRoutes(
        context,
        new Request(url),
        url,
      );
      return { status: response?.status, data: await response?.json() };
    }

    const all = [...firstRun, ...nextRun];
    for (const offset of [0, 50, 1030, 1070, 2500]) {
      const end = Math.max(0, all.length - offset);
      const start = Math.max(0, end - 50);
      const expected = all.slice(start, end);
      expect(await page(sessionId, offset)).toEqual({
        status: 200,
        data: {
          messages: expected,
          hasEarlier: start > 0,
          nextOffset: offset + expected.length,
          totalMessages: all.length,
        },
      });
    }
    expect(await page("missing", 3)).toEqual({
      status: 200,
      data: {
        messages: [],
        hasEarlier: false,
        nextOffset: 3,
        totalMessages: 0,
      },
    });
    expect(await page(sessionId, 0, "earlier-run")).toEqual({
      status: 200,
      data: {
        messages: firstRun.slice(-50),
        hasEarlier: true,
        nextOffset: 50,
        throughRunId: "earlier-run",
        throughMessageId: firstRun.at(-1)?.id,
        terminalStatus: "complete",
      },
    });
    expect((await page("other", 0, "earlier-run")).status).toBe(410);

    const older = message(-1);
    sessions.storeMessage(older);
    expect((await page(sessionId, 0, "earlier-run")).status).toBe(410);
    expect(sessions.search("1086", 5)).toHaveLength(2);
  } finally {
    db.close();
  }
});
