import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Memory, UUID } from "@elizaos/core";
import { afterEach, expect, it } from "vitest";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import { rollbackNativeConversationReplay } from "../../packages/agent/src/runtime/chat-turn/conversation-persistence";
import { handleSessionCommand } from "../../packages/agent/src/runtime/commands/session-router";
import { SessionMessageStore } from "../../packages/agent/src/services/session/messages";
import { createSessionDatabase } from "../../packages/agent/src/services/session/service/support";
import type { StoredMessage } from "../../packages/agent/src/types";

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close();
});
type Failure =
  | "none"
  | "summary"
  | "summary-after-commit"
  | "partial-delete"
  | "projection"
  | "rollback";
function fixture(failure: Failure) {
  const dir = mkdtempSync(
    resolve(tmpdir(), "doolittle-conversation-recovery-"),
  );
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  let native = new DatabaseSync(resolve(dir, "native.sqlite"));
  let projection = createSessionDatabase(dir);
  cleanup.push(() => {
    native.close();
    projection.close();
  });
  native.exec(
    "CREATE TABLE memories (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, payload TEXT NOT NULL)",
  );
  let store = new SessionMessageStore(projection, new EventEmitter());
  const roomId = randomUUID(),
    agentId = randomUUID(),
    entityId = randomUUID();
  const sessionId = "cli:recovery";
  const messages: StoredMessage[] = Array.from({ length: 7 }, (_, index) => ({
    id: randomUUID(),
    sessionId,
    roomId,
    entityId,
    role: index % 2 ? "assistant" : "user",
    text: `Original message ${index}`,
    createdAt: new Date(Date.UTC(2026, 9, 25, 0, 0, index)).toISOString(),
  }));
  for (const message of messages) {
    store.storeMessage(message);
    const memory = {
      id: message.id,
      roomId,
      entityId,
      agentId,
      content: { text: message.text },
      metadata: { doolittle: { role: message.role } },
      createdAt: Date.parse(message.createdAt),
    };
    native
      .prepare("INSERT INTO memories VALUES (?, ?, ?)")
      .run(message.id, roomId, JSON.stringify(memory));
  }
  if (failure === "projection" || failure === "rollback")
    projection.exec(`
    CREATE TRIGGER fail_summary BEFORE INSERT ON messages
    WHEN NEW.text LIKE '[CONTEXT SUMMARY%'
    BEGIN SELECT RAISE(ABORT, 'forced projection failure'); END;
  `);
  let summaryFailed = false,
    deletionFailed = false,
    deleted = 0;
  const runtime = {
    agentId,
    async getMemories(input: {
      roomId: string;
      limit: number;
      offset: number;
    }) {
      return native
        .prepare(
          "SELECT payload FROM memories WHERE room_id = ? ORDER BY json_extract(payload, '$.createdAt') DESC LIMIT ? OFFSET ?",
        )
        .all(input.roomId, input.limit, input.offset)
        .map((row) => JSON.parse(String(row.payload)) as Memory);
    },
    async createMemory(memory: Memory) {
      const summary = memory.content.text?.startsWith("[CONTEXT SUMMARY");
      if (summary && failure === "summary" && !summaryFailed) {
        summaryFailed = true;
        throw new Error("forced summary failure");
      }
      native
        .prepare(
          "INSERT INTO memories VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
        )
        .run(String(memory.id), String(memory.roomId), JSON.stringify(memory));
      if (summary && failure === "summary-after-commit" && !summaryFailed) {
        summaryFailed = true;
        throw new Error("forced summary acknowledgement failure");
      }
    },
    async deleteMemory(id: string) {
      const row = native
        .prepare("SELECT payload FROM memories WHERE id = ?")
        .get(id);
      const memory = row
        ? (JSON.parse(String(row.payload)) as Memory)
        : undefined;
      if (
        failure === "rollback" &&
        memory?.content.text?.startsWith("[CONTEXT SUMMARY")
      )
        throw new Error("forced compensation failure");
      native.prepare("DELETE FROM memories WHERE id = ?").run(id);
      deleted++;
      if (failure === "partial-delete" && deleted === 2 && !deletionFailed) {
        deletionFailed = true;
        throw new Error("forced deletion acknowledgement failure");
      }
    },
  };
  const context = {
    runtime,
    services: {
      sessions: {
        messagesBySession: store.messagesBySession.bind(store),
        replaceSessionMessages: store.replaceSessionMessages.bind(store),
        continuityKey: () => sessionId,
      },
      contextCompression: {
        measure: (rows: unknown[]) => ({ estimatedTokens: rows.length * 100 }),
      },
      trajectoryEvaluation: { recordEvent: () => undefined },
    },
  } as unknown as AgentExecutionContext;
  const nativeRows = () =>
    native
      .prepare("SELECT payload FROM memories ORDER BY id")
      .all()
      .map((row) => JSON.parse(String(row.payload)) as Memory);
  const originals = nativeRows();
  return {
    messages,
    originals,
    nativeRows,
    async compress() {
      return handleSessionCommand(
        { message: "/compress", source: "cli", userId: entityId },
        "/compress",
        sessionId,
        context,
        {
          runAnalysis: async () => "Durable summary",
          executeDelegationTask: async () => {
            throw new Error("Delegation is outside this compression fixture.");
          },
        },
      );
    },
    async rollbackReplay() {
      const replayId = randomUUID() as UUID;
      const seed = originals[0],
        second = originals[1];
      if (!seed || !second) throw new Error("Missing replay seed");
      const concurrent: Memory = {
        ...seed,
        id: randomUUID() as UUID,
        content: { text: "Unrelated concurrent message" },
      };
      native
        .prepare("DELETE FROM memories WHERE id IN (?, ?)")
        .run(String(seed.id), String(second.id));
      await runtime.createMemory({
        ...seed,
        id: replayId,
        content: { text: "Failed replay" },
      });
      await runtime.createMemory({
        ...seed,
        id: randomUUID() as UUID,
        content: { text: "Partial replay answer", inReplyTo: replayId },
      });
      await runtime.createMemory(concurrent);
      await rollbackNativeConversationReplay({
        context,
        roomId: roomId as UUID,
        replayMessageId: replayId,
        originalSnapshots: originals.slice(0, 2),
      });
      return concurrent;
    },
    restart() {
      native.close();
      projection.close();
      native = new DatabaseSync(resolve(dir, "native.sqlite"));
      projection = createSessionDatabase(dir);
      store = new SessionMessageStore(projection, new EventEmitter());
      return {
        native: nativeRows(),
        projection: store.messagesBySession(sessionId, 100),
      };
    },
  };
}
for (const failure of [
  "summary",
  "summary-after-commit",
  "partial-delete",
  "projection",
] as const) {
  it(`preserves both durable transcripts after ${failure} failure and restart`, async () => {
    const f = fixture(failure);
    await expect(f.compress()).rejects.toThrow();
    const restored = f.restart();
    expect(restored.native).toEqual(f.originals);
    expect(restored.projection).toEqual(f.messages);
  });
}
it("reports failed compensation instead of claiming compression succeeded", async () => {
  const f = fixture("rollback");
  await expect(f.compress()).rejects.toThrow(/native context rollback failed/);
  const restored = f.restart();
  expect(restored.projection).toEqual(f.messages);
  expect(
    restored.native.some((row) =>
      row.content.text?.includes("CONTEXT SUMMARY"),
    ),
  ).toBe(true);
});
it("publishes the same successful compressed history to both stores", async () => {
  const f = fixture("none");
  await expect(f.compress()).resolves.toContain("Context compressed");
  const restored = f.restart();
  expect(restored.projection).toHaveLength(5);
  expect(restored.native).toHaveLength(5);
  expect(restored.native.map((row) => row.id).sort()).toEqual(
    restored.projection.map((row) => row.id).sort(),
  );
  expect(restored.projection[1].text).toContain("Durable summary");
});

it("removes only a failed replay and restores its original exchange across restart", async () => {
  const f = fixture("none");
  const concurrent = await f.rollbackReplay();
  const restored = f.restart();
  expect(restored.native).toEqual(
    [...f.originals, concurrent].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    ),
  );
  expect(restored.projection).toEqual(f.messages);
});
