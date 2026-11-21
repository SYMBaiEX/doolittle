import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Memory, UUID } from "@elizaos/core";
import { expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import { persistUserTurnMemory } from "../../packages/agent/src/runtime/chat-turn/conversation-persistence";
import type { TurnState } from "../../packages/agent/src/runtime/chat-turn/state";
import { SessionMessageStore } from "../../packages/agent/src/services/session/messages";
import { createSessionDatabase } from "../../packages/agent/src/services/session/service/support";
import type { StoredMessage } from "../../packages/agent/src/types";

async function reopenConversation(middleDrifts: boolean) {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-reopen-turn-"));
  const db = createSessionDatabase(directory);
  try {
    const roomId = randomUUID();
    const entityId = randomUUID();
    const agentId = randomUUID() as UUID;
    const sessionId = "reopened";
    const history = ["older message", "original text", "newest message"].map(
      (text, index): StoredMessage => ({
        text,
        id: randomUUID(),
        sessionId,
        roomId,
        entityId,
        role: "user",
        createdAt: new Date(index * 1000).toISOString(),
        ...(index === 1
          ? {
              attachments: [
                {
                  id: randomUUID(),
                  name: "sample.txt",
                  kind: "document",
                  mimeType: "text/plain",
                  sizeBytes: 10,
                  sha256: "0".repeat(64),
                },
              ],
            }
          : {}),
      }),
    );
    const events = new EventEmitter();
    const messages = new SessionMessageStore(db, events);
    for (const row of history) messages.storeMessage(row);
    const otherConversation = {
      ...history[0],
      id: randomUUID(),
      sessionId: "another-chat",
      roomId: randomUUID(),
    };
    messages.storeMessage(otherConversation);
    messages.recordRunTerminalBoundary("previous", sessionId, "complete");
    const activity = vi.fn();
    messages.onActivity(activity);

    // Model a fresh AgentRuntime. The fixture reads the full authoritative
    // transcript in its native descending order like the SDK database adapter.
    const native: Memory[] = history
      .map((row, index) => ({
        id: row.id as UUID,
        agentId,
        roomId: row.roomId as UUID,
        entityId: row.entityId as UUID,
        content: {
          text: index === 1 && middleDrifts ? "corrected text" : row.text,
        },
        createdAt: Date.parse(row.createdAt),
      }))
      .reverse();
    const getMemories = vi.fn(
      async ({ limit, offset }: { limit: number; offset: number }) =>
        native.slice(offset, offset + limit),
    );
    const turn = {
      roomId,
      entityId,
      sessionId,
      messageId: randomUUID(),
      connectionSource: "desktop",
    } as TurnState;
    const context = {
      runtime: { agentId, getMemories, createMemory: vi.fn(async () => {}) },
      services: { sessions: messages },
    } as unknown as AgentExecutionContext;
    await persistUserTurnMemory({
      context,
      turn,
      userId: "operator",
      text: "send the next message",
    });
    expect(getMemories).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ roomId, orderDirection: "desc" }),
    );
    const rows = messages.messagesBySession(sessionId, 4);
    expect(messages.messagesBySession(otherConversation.sessionId, 1)).toEqual([
      otherConversation,
    ]);
    expect(rows[1].attachments).toEqual(history[1].attachments);
    expect(rows[3].id).toBe(turn.messageId);
    if (middleDrifts) {
      expect(rows[1].text).toBe("corrected text");
      expect(messages.search("corrected", 5)).toHaveLength(1);
      expect(messages.search("original", 5)).toHaveLength(0);
      expect(() =>
        messages.messagesThroughRun("previous", sessionId, 4),
      ).toThrow("The exact transcript boundary");
    } else {
      expect(activity).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ detail: "[user] send the next message" }),
      );
      expect(
        messages.messagesThroughRun("previous", sessionId, 4).messages,
      ).toEqual(history);
    }
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

it("keeps old run boundaries and attachment metadata on unchanged reopen", () =>
  reopenConversation(false));

it("repairs an authoritative middle row change despite matching count and edges", () =>
  reopenConversation(true));
