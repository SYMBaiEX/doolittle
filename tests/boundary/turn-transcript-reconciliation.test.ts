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

async function reopenConversation(
  options: {
    middleDrifts?: boolean;
    cancelFirstRead?: boolean;
    stallCursor?: boolean;
    size?: number;
  } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-reopen-turn-"));
  const db = createSessionDatabase(directory);
  try {
    const roomId = randomUUID();
    const entityId = randomUUID();
    const agentId = randomUUID() as UUID;
    const sessionId = "reopened";
    const size = options.size ?? 3;
    const history = Array.from({ length: size }, (_, index) =>
      index === 1 ? "original text" : `Message ${index}`,
    ).map(
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
    db.exec("BEGIN");
    for (const row of history) messages.storeMessage(row);
    const otherConversation = {
      ...history[0],
      id: randomUUID(),
      sessionId: "another-chat",
      roomId: randomUUID(),
    };
    messages.storeMessage(otherConversation);
    db.exec("COMMIT");
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
          text:
            index === 1 && options.middleDrifts ? "corrected text" : row.text,
        },
        createdAt: Date.parse(row.createdAt),
      }))
      .reverse();
    const cancellation = new AbortController();
    const getMemories = vi.fn(
      async (input: {
        limit: number;
        cursor?: { createdAt: number; id: UUID };
      }) => {
        if (options.cancelFirstRead && getMemories.mock.calls.length === 1) {
          cancellation.abort();
        }
        const offset =
          input.cursor && !options.stallCursor
            ? native.findIndex((memory) => memory.id === input.cursor?.id) + 1
            : 0;
        return native.slice(offset, offset + input.limit);
      },
    );
    const turn = {
      roomId,
      entityId,
      sessionId,
      messageId: randomUUID(),
      connectionSource: "desktop",
    } as TurnState;
    const createMemory = vi.fn(async () => {});
    const context = {
      runtime: { agentId, getMemories, createMemory },
      services: { sessions: messages },
    } as unknown as AgentExecutionContext;
    const send = (signal?: AbortSignal) =>
      persistUserTurnMemory({
        context,
        turn,
        userId: "operator",
        text: "send the next message",
        signal,
      });
    if (options.cancelFirstRead) {
      await expect(send(cancellation.signal)).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(getMemories).toHaveBeenCalledTimes(1);
      expect(createMemory).not.toHaveBeenCalled();
      expect(activity).not.toHaveBeenCalled();
      expect(messages.messagesBySession(sessionId, size + 1)).toEqual(history);
      getMemories.mockClear();
    }
    if (options.stallCursor) {
      await expect(send()).rejects.toThrow(
        "Native conversation history did not advance.",
      );
      expect(createMemory).not.toHaveBeenCalled();
      expect(activity).not.toHaveBeenCalled();
      expect(messages.messagesBySession(sessionId, size + 1)).toEqual(history);
      return;
    }
    await send();
    expect(getMemories).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ roomId, orderDirection: "desc" }),
    );
    if (size > 2000) {
      const lastOnFirstPage = native[1999];
      expect(getMemories).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          cursor: {
            id: lastOnFirstPage.id,
            createdAt: lastOnFirstPage.createdAt,
          },
        }),
      );
      expect(getMemories).toHaveBeenCalledTimes(2);
    } else {
      expect(getMemories).toHaveBeenCalledOnce();
    }
    const rows = messages.messagesBySession(sessionId, size + 1);
    expect(messages.messagesBySession(otherConversation.sessionId, 1)).toEqual([
      otherConversation,
    ]);
    expect(rows[1].attachments).toEqual(history[1].attachments);
    expect(rows[size].id).toBe(turn.messageId);
    if (options.middleDrifts) {
      expect(rows[1].text).toBe("corrected text");
      expect(messages.search("corrected", 5)).toHaveLength(1);
      expect(messages.search("original", 5)).toHaveLength(0);
      expect(() =>
        messages.messagesThroughRun("previous", sessionId, size + 1),
      ).toThrow("The exact transcript boundary");
    } else {
      expect(activity).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ detail: "[user] send the next message" }),
      );
      expect(
        messages.messagesThroughRun("previous", sessionId, size + 1).messages,
      ).toEqual(history);
    }
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

it("keeps old run boundaries and attachment metadata on unchanged reopen", () =>
  reopenConversation());

it("repairs an authoritative middle row change despite matching count and edges", () =>
  reopenConversation({ middleDrifts: true, size: 2002 }));

it("cancels native reads before paging or persisting and retries with complete history", () =>
  reopenConversation({ cancelFirstRead: true, size: 2002 }));

it("keeps the previous projection when a native cursor does not advance", () =>
  reopenConversation({ stallCursor: true, size: 2002 }));
