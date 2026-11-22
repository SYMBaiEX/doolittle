import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Memory, UUID } from "@elizaos/core";
import {
  createDatabaseAdapter,
  PgliteDatabaseAdapter,
} from "@elizaos/plugin-sql";
import { expect, it } from "vitest";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import { persistUserTurnMemory } from "../../packages/agent/src/runtime/chat-turn/conversation-persistence";
import type { TurnState } from "../../packages/agent/src/runtime/chat-turn/state";
import { NodeSessionDatabase } from "../../packages/agent/src/services/session/database";
import { migrateSessionDatabase } from "../../packages/agent/src/services/session/schema";
import { SessionService } from "../../packages/agent/src/services/session/service";
import { getTranscriptCheckpointStore } from "../../packages/agent/src/services/session/service/state";

async function fixture() {
  const directory = mkdtempSync(
    join(tmpdir(), "doolittle-transcript-checkpoint-"),
  );
  const agentId = randomUUID() as UUID;
  const roomId = randomUUID() as UUID;
  const entityId = randomUUID() as UUID;
  const sessionId = "local:checkpoint";
  const dataDir = join(directory, "pglite");
  const native = () => {
    const adapter = createDatabaseAdapter({ dataDir }, agentId);
    if (!(adapter instanceof PgliteDatabaseAdapter))
      throw new Error("Expected PGlite");
    return adapter;
  };
  let adapter = native();
  let sessions = new SessionService(directory);
  const reads: Array<{ limit?: number; direction?: string }> = [];
  await adapter.initialize();
  await adapter.getRawConnection().exec(`
    CREATE TABLE memories (
      id UUID PRIMARY KEY, type TEXT NOT NULL, created_at TIMESTAMP NOT NULL,
      content JSONB NOT NULL, entity_id UUID NOT NULL, agent_id UUID NOT NULL,
      room_id UUID NOT NULL, world_id UUID, "unique" BOOLEAN, metadata JSONB
    );
  `);
  const remember = async (memory: Memory) => {
    await adapter.getRawConnection().query(
      `
      INSERT INTO memories (id, type, created_at, content, entity_id, agent_id, room_id, metadata)
      VALUES ($1::uuid, 'messages', $2::timestamp, $3::jsonb, $4::uuid, $5::uuid, $6::uuid, $7::jsonb)
    `,
      [
        memory.id,
        new Date(memory.createdAt ?? 0).toISOString(),
        JSON.stringify(memory.content),
        memory.entityId,
        memory.agentId,
        memory.roomId,
        JSON.stringify(memory.metadata),
      ],
    );
  };
  function context() {
    return {
      runtime: {
        agentId,
        adapter,
        createMemory: remember,
        getMemories: (params: Parameters<typeof adapter.getMemories>[0]) => {
          reads.push({ limit: params.limit, direction: params.orderDirection });
          return adapter.getMemories(params);
        },
      },
      services: { sessions },
    } as unknown as AgentExecutionContext;
  }
  let currentContext = context();
  const originalId = randomUUID() as UUID;
  const originalAt = Date.UTC(2025, 0, 1);
  const original = {
    id: originalId,
    sessionId,
    roomId,
    entityId,
    role: "user" as const,
    createdAt: new Date(originalAt).toISOString(),
    text: "Original text",
  };
  await remember({
    id: originalId,
    roomId,
    entityId,
    agentId,
    createdAt: originalAt,
    content: { text: original.text },
    metadata: { doolittle: { role: "user" } },
  });
  sessions.storeMessage(original);
  return {
    reads,
    sessionId,
    get sessions() {
      return sessions;
    },
    async turn(text: string) {
      await persistUserTurnMemory({
        context: currentContext,
        userId: entityId,
        text,
        turn: {
          sessionId,
          roomId,
          entityId,
          localInteractive: false,
          connectionSource: "cli",
          messageId: randomUUID(),
        } as TurnState,
      });
    },
    async reopen() {
      await adapter.close();
      adapter = native();
      await adapter.initialize();
      sessions = new SessionService(directory);
      currentContext = context();
      reads.length = 0;
    },
    async editNativePrefix() {
      await adapter
        .getRawConnection()
        .query("UPDATE memories SET content = $1::jsonb WHERE id = $2::uuid", [
          JSON.stringify({ text: "Native edit" }),
          originalId,
        ]);
    },
    async close() {
      await adapter.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

it("reuses a durable checkpoint for a matching reopened tail and preserves saved run boundaries", async () => {
  const f = await fixture();
  try {
    await f.turn("Written in the first runtime");
    expect(f.reads).toEqual([{ limit: 2000, direction: "desc" }]);
    f.sessions.recordRunTerminalBoundary("old-run", f.sessionId, "complete");
    await f.reopen();
    expect(
      getTranscriptCheckpointStore(f.sessions)?.transcriptCheckpoint(
        f.sessionId,
      ),
    ).toBeDefined();
    await f.turn("Written after reopening");
    expect(f.reads).toEqual([{ limit: 257, direction: "asc" }]);
    expect(
      f.sessions
        .messagesThroughRun("old-run", f.sessionId, 10)
        .messages.map((row) => row.text),
    ).toEqual(["Original text", "Written in the first runtime"]);
    expect(
      f.sessions.messagesBySession(f.sessionId, 10).map((row) => row.text),
    ).toEqual([
      "Original text",
      "Written in the first runtime",
      "Written after reopening",
    ]);
  } finally {
    await f.close();
  }
});

it("repairs an edited native prefix even when the row count and time are unchanged", async () => {
  const f = await fixture();
  try {
    await f.turn("First turn");
    await f.editNativePrefix();
    await f.reopen();
    await f.turn("Second turn");
    expect(f.reads).toEqual([{ limit: 2000, direction: "desc" }]);
    expect(f.sessions.search("Native", 10).map((row) => row.text)).toEqual([
      "Native edit",
    ]);
    expect(f.sessions.search("Original", 10)).toEqual([]);
  } finally {
    await f.close();
  }
});

it("adds checkpoints to version-one profiles without rebuilding their activity projection", () => {
  const db = new NodeSessionDatabase(":memory:");
  try {
    migrateSessionDatabase(db);
    db.exec(`
      DROP TRIGGER transcript_checkpoint_on_insert;
      DROP TRIGGER transcript_checkpoint_on_update;
      DROP TRIGGER transcript_checkpoint_on_delete;
      DROP TABLE session_transcript_checkpoints;
      PRAGMA user_version = 1;
      INSERT INTO messages (id, session_id, room_id, entity_id, role, text, created_at)
        VALUES ('old-id', 'session', 'room', 'entity', 'user', 'Saved text', '2026-01-01');
    `);
    migrateSessionDatabase(db);
    expect(
      db
        .query("SELECT message_count AS count FROM session_message_activity")
        .all(),
    ).toEqual([{ count: 1 }]);
    expect(
      db.query("SELECT * FROM session_transcript_checkpoints").all(),
    ).toEqual([]);
    db.exec(`
      INSERT INTO session_transcript_checkpoints VALUES ('session', 'room', 'agent', 'old-id', '2026-01-01', 'marker');
      INSERT INTO messages (id, session_id, room_id, entity_id, role, text, created_at)
        VALUES ('new-id', 'session', 'room', 'entity', 'assistant', 'Late text', '2026-01-02');
    `);
    expect(
      db.query("SELECT fingerprint FROM session_transcript_checkpoints").all(),
    ).toEqual([{ fingerprint: "marker" }]);
    db.exec("UPDATE messages SET text = 'Edited text' WHERE id = 'old-id'");
    expect(
      db.query("SELECT * FROM session_transcript_checkpoints").all(),
    ).toEqual([]);
  } finally {
    db.close();
  }
});
