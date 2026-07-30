import { randomUUID } from "node:crypto";
import {
  ChannelType,
  type Content,
  type Memory,
  type UUID,
} from "@elizaos/core";
import type { AgentExecutionContext } from "@/runtime/chat";
import { stableRuntimeUuid } from "@/runtime/stable-runtime-uuid";
import type { StoredMessage, StoredMessageAttachment } from "@/types";
import type { TurnState } from "./state";

function nowIso(createdAt?: number): string {
  return new Date(createdAt ?? Date.now()).toISOString();
}

function contentText(content: Content | undefined): string {
  return typeof content?.text === "string" ? content.text : "";
}

function roleForMemory(
  context: AgentExecutionContext,
  memory: Memory,
): StoredMessage["role"] {
  const metadata = memory.metadata as
    | { doolittle?: { role?: StoredMessage["role"] } }
    | undefined;
  if (metadata?.doolittle?.role) return metadata.doolittle.role;
  return String(memory.entityId) === String(context.runtime.agentId)
    ? "assistant"
    : "user";
}

function isConversationMemory(
  context: AgentExecutionContext,
  memory: Memory,
): boolean {
  const metadata = memory.metadata as
    | { doolittle?: { role?: StoredMessage["role"] } }
    | undefined;
  if (metadata?.doolittle?.role) return true;
  if (String(memory.entityId) !== String(context.runtime.agentId)) return true;
  return (
    Array.isArray(memory.content?.actions) &&
    memory.content.actions.includes("REPLY")
  );
}

function toProjectionMessage(
  context: AgentExecutionContext,
  turn: TurnState,
  memory: Memory,
  attachments?: StoredMessageAttachment[],
): StoredMessage {
  return {
    id: String(memory.id),
    sessionId: turn.sessionId,
    roomId: String(memory.roomId),
    entityId: String(memory.entityId),
    role: roleForMemory(context, memory),
    text: contentText(memory.content),
    attachments,
    createdAt: nowIso(memory.createdAt),
  };
}

function projectMessage(
  context: AgentExecutionContext,
  turn: TurnState,
  memory: Memory,
  attachments?: StoredMessageAttachment[],
): void {
  context.services.sessions.storeMessage(
    toProjectionMessage(context, turn, memory, attachments),
  );
}

function continuityKey(
  context: AgentExecutionContext,
  sessionId: string,
): string {
  const resolver = context.services.sessions.continuityKey;
  return typeof resolver === "function"
    ? resolver.call(context.services.sessions, sessionId)
    : sessionId;
}

async function persistNativeMemory(
  context: AgentExecutionContext,
  memory: Memory,
  priority: "high" | "normal",
): Promise<void> {
  // Production AgentRuntime always supplies these SDK methods. The guards keep
  // narrow unit-test doubles useful without inventing a second persistence path.
  if (typeof context.runtime.createMemory === "function") {
    await context.runtime.createMemory(memory, "messages");
  }
  if (typeof context.runtime.queueEmbeddingGeneration === "function") {
    await context.runtime.queueEmbeddingGeneration(memory, priority);
  }
}

function memoryIdForProjection(message: StoredMessage): UUID {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    message.id,
  )
    ? (message.id as UUID)
    : (stableRuntimeUuid(
        `session-projection:${message.sessionId}:${message.id}`,
      ) as UUID);
}

function nativeMemoryFromProjection(
  context: AgentExecutionContext,
  turn: TurnState,
  message: StoredMessage,
): Memory {
  const isAssistant = message.role === "assistant";
  return {
    id: memoryIdForProjection(message),
    agentId: context.runtime.agentId,
    entityId: isAssistant ? context.runtime.agentId : (turn.entityId as UUID),
    roomId: turn.roomId as UUID,
    content: {
      text: message.text,
      source: turn.connectionSource,
      channelType: ChannelType.DM,
    },
    metadata: {
      sessionId: turn.sessionId,
      sessionKey: continuityKey(context, turn.sessionId),
      doolittle: {
        role: message.role,
        source: turn.connectionSource,
        projectionOriginMessageId: message.originMessageId ?? message.id,
      },
    },
    createdAt: Date.parse(message.createdAt) || Date.now(),
  };
}

/**
 * One-time bridge for pre-migration and forked transcripts. New turns already
 * write to Eliza first, but a fork begins as Doolittle product metadata. Before
 * its first prompt, seed the empty native room with the inherited read model.
 */
async function hydrateNativeRoomFromProjection(
  context: AgentExecutionContext,
  turn: TurnState,
): Promise<void> {
  if (
    typeof context.runtime.getMemories !== "function" ||
    typeof context.runtime.createMemory !== "function"
  ) {
    return;
  }
  const nativeMessages = await context.runtime.getMemories({
    roomId: turn.roomId as UUID,
    tableName: "messages",
    limit: 100,
    orderBy: "createdAt",
    orderDirection: "desc",
    includeEmbedding: false,
  });
  if (nativeMessages.length > 0) {
    for (const memory of nativeMessages.reverse()) {
      if (
        !memory.id ||
        !contentText(memory.content) ||
        !isConversationMemory(context, memory)
      ) {
        continue;
      }
      projectMessage(context, turn, memory);
    }
    return;
  }

  const projectedMessages = context.services.sessions.messagesBySession(
    turn.sessionId,
    10_000,
  );
  for (const message of projectedMessages) {
    const memory = nativeMemoryFromProjection(context, turn, message);
    await persistNativeMemory(context, memory, "normal");
  }
}

export async function persistUserTurnMemory(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  userId: string;
  text: string;
  attachments?: StoredMessageAttachment[];
}): Promise<void> {
  await hydrateNativeRoomFromProjection(input.context, input.turn);
  const memory: Memory = {
    id: input.turn.messageId as UUID,
    agentId: input.context.runtime.agentId,
    entityId: input.turn.entityId as UUID,
    roomId: input.turn.roomId as UUID,
    content: {
      text: input.text,
      source: input.turn.connectionSource,
      channelType: ChannelType.DM,
    },
    metadata: {
      sessionId: input.turn.sessionId,
      sessionKey: continuityKey(input.context, input.turn.sessionId),
      doolittle: {
        role: "user",
        userId: input.userId,
        source: input.turn.connectionSource,
      },
    },
    createdAt: Date.now(),
  };
  await persistNativeMemory(input.context, memory, "high");
  projectMessage(input.context, input.turn, memory, input.attachments);
}

export async function persistAssistantTurnMemory(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  text: string;
}): Promise<Memory> {
  const memory: Memory = {
    id: randomUUID() as UUID,
    agentId: input.context.runtime.agentId,
    entityId: input.context.runtime.agentId,
    roomId: input.turn.roomId as UUID,
    content: {
      text: input.text,
      source: input.turn.connectionSource,
      channelType: ChannelType.DM,
      inReplyTo: input.turn.messageId as UUID,
    },
    metadata: {
      sessionId: input.turn.sessionId,
      sessionKey: continuityKey(input.context, input.turn.sessionId),
      doolittle: {
        role: "assistant",
        source: input.turn.connectionSource,
      },
    },
    createdAt: Date.now(),
  };
  await persistNativeMemory(input.context, memory, "normal");
  projectMessage(input.context, input.turn, memory);
  return memory;
}

export function projectNativeResponseMemories(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  memories: Memory[];
  responseText: string;
}): boolean {
  const visible = input.memories.filter(
    (memory) => memory.id && contentText(memory.content),
  );
  const expected = input.responseText.trim();
  for (let index = visible.length - 1; index >= 0; index -= 1) {
    const candidate = visible[index];
    if (candidate && contentText(candidate.content).trim() === expected) {
      projectMessage(input.context, input.turn, candidate);
      return true;
    }
  }
  return false;
}
