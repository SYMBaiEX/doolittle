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

export type NativeUserMemoryOwner = "doolittle" | "eliza-message-service";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NATIVE_MEMORY_PAGE_SIZE = 500;
const hydratedNativeRooms = new WeakMap<object, Set<string>>();

function nativeHydrationKey(turn: TurnState): string {
  return `${turn.sessionId}\u0000${String(turn.roomId)}`;
}

function isNativeRoomHydrated(
  context: AgentExecutionContext,
  turn: TurnState,
): boolean {
  return (
    hydratedNativeRooms.get(context.runtime)?.has(nativeHydrationKey(turn)) ??
    false
  );
}

function markNativeRoomHydrated(
  context: AgentExecutionContext,
  turn: TurnState,
): void {
  const hydrated = hydratedNativeRooms.get(context.runtime) ?? new Set();
  hydrated.add(nativeHydrationKey(turn));
  hydratedNativeRooms.set(context.runtime, hydrated);
}

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
  return UUID_PATTERN.test(message.id)
    ? (message.id as UUID)
    : (stableRuntimeUuid(
        `session-projection:${message.sessionId}:${message.id}`,
      ) as UUID);
}

function canDeleteMemory(
  runtime: AgentExecutionContext["runtime"],
): runtime is AgentExecutionContext["runtime"] & {
  deleteMemory(memoryId: UUID): Promise<void>;
} {
  return typeof runtime.deleteMemory === "function";
}

async function nativeConversationMemories(
  context: AgentExecutionContext,
  turn: TurnState,
): Promise<Memory[]> {
  if (typeof context.runtime.getMemories !== "function") return [];
  const memories: Memory[] = [];
  const seenPages = new Set<string>();
  let offset = 0;

  for (;;) {
    const page = await context.runtime.getMemories({
      roomId: turn.roomId as UUID,
      tableName: "messages",
      limit: NATIVE_MEMORY_PAGE_SIZE,
      offset,
      orderBy: "createdAt",
      orderDirection: "desc",
      includeEmbedding: false,
    });
    if (!page.length) break;

    // A non-conforming adapter that ignores offset must not turn recovery into
    // an infinite loop. Memory IDs are authoritative page identities here.
    const pageKey = page
      .map((memory) => String(memory.id ?? ""))
      .join("\u0000");
    if (seenPages.has(pageKey)) break;
    seenPages.add(pageKey);
    memories.push(...page);
    if (page.length < NATIVE_MEMORY_PAGE_SIZE) break;
    offset += page.length;
  }

  return memories.reverse();
}

/**
 * The installed Eliza runtime exposes deleteMemory. Keep this capability
 * check at the boundary so old test doubles and older compatible runtimes
 * degrade safely rather than making SQLite pretend a native deletion happened.
 */
export async function deleteNativeConversationMemories(
  context: AgentExecutionContext,
  messages: ReadonlyArray<Pick<StoredMessage, "id">>,
): Promise<{ deleted: string[]; unsupported: string[] }> {
  // Older CLI/test hosts may have no AgentRuntime memory persistence at all.
  // In that mode SQLite remains the only available compatibility transcript.
  const runtime = context.runtime;
  if (
    !runtime ||
    (typeof runtime.createMemory !== "function" && !canDeleteMemory(runtime))
  ) {
    return { deleted: [], unsupported: [] };
  }
  const ids = messages
    .map((message) => message.id)
    .filter((id) => UUID_PATTERN.test(id));
  const unsupported = messages
    .map((message) => message.id)
    .filter((id) => !UUID_PATTERN.test(id));
  if (!ids.length) return { deleted: [], unsupported };
  if (!canDeleteMemory(runtime)) {
    return { deleted: [], unsupported: [...unsupported, ...ids] };
  }
  await Promise.all(ids.map((id) => runtime.deleteMemory(id as UUID)));
  return { deleted: ids, unsupported };
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
  if (isNativeRoomHydrated(context, turn)) return;
  // Fetch the whole authoritative transcript before replacing the projection.
  // Replacing from a suffix would silently delete older cache rows.
  const nativeMessages = await nativeConversationMemories(context, turn);
  const conversationMemories = nativeMessages.filter(
    (memory) =>
      memory.id &&
      contentText(memory.content) &&
      isConversationMemory(context, memory),
  );
  if (conversationMemories.length > 0) {
    const existing = context.services.sessions.messagesBySession(
      turn.sessionId,
      Number.MAX_SAFE_INTEGER,
    );
    const attachmentsById = new Map(
      existing.map((message) => [message.id, message.attachments]),
    );
    const projected = conversationMemories.map((memory) => {
      const metadata = memory.metadata as
        | { doolittle?: { projectionOriginMessageId?: string } }
        | undefined;
      const attachmentSource =
        metadata?.doolittle?.projectionOriginMessageId ?? String(memory.id);
      return toProjectionMessage(
        context,
        turn,
        memory,
        attachmentsById.get(attachmentSource),
      );
    });
    if (
      typeof context.services.sessions.replaceSessionMessages === "function"
    ) {
      context.services.sessions.replaceSessionMessages(
        turn.sessionId,
        projected,
      );
    } else {
      // Narrow doubles/old hosts do not expose a cache-replacement API.
      for (const message of projected) {
        context.services.sessions.storeMessage(message);
      }
    }
    markNativeRoomHydrated(context, turn);
    return;
  }

  const projectedMessages = context.services.sessions.messagesBySession(
    turn.sessionId,
    Number.MAX_SAFE_INTEGER,
  );
  const reprojected: StoredMessage[] = [];
  for (const message of projectedMessages) {
    const memory = nativeMemoryFromProjection(context, turn, message);
    await persistNativeMemory(context, memory, "normal");
    reprojected.push(
      toProjectionMessage(context, turn, memory, message.attachments),
    );
  }
  // Legacy rows predate UUID-native memory identity. Once they have been
  // backfilled, replace only this session's cache with native IDs so later
  // retry/compression can mutate the actual authoritative memories.
  if (
    reprojected.some(
      (message, index) => message.id !== projectedMessages[index]?.id,
    ) &&
    typeof context.services.sessions.replaceSessionMessages === "function"
  ) {
    context.services.sessions.replaceSessionMessages(
      turn.sessionId,
      reprojected,
    );
  }
  markNativeRoomHydrated(context, turn);
}

export async function persistUserTurnMemory(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  userId: string;
  text: string;
  attachments?: StoredMessageAttachment[];
  nativeOwner?: NativeUserMemoryOwner;
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
  if ((input.nativeOwner ?? "doolittle") === "doolittle") {
    await persistNativeMemory(input.context, memory, "high");
  }
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

/** Persist a summary as an Eliza message, then remove only the native middle
 * context it replaces. The caller updates the SQLite projection afterwards. */
export async function replaceNativeConversationContext(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  replaced: StoredMessage[];
  summary: StoredMessage;
}): Promise<{ unsupported: string[] }> {
  const memory = nativeMemoryFromProjection(
    input.context,
    input.turn,
    input.summary,
  );
  await persistNativeMemory(input.context, memory, "normal");
  try {
    const result = await deleteNativeConversationMemories(
      input.context,
      input.replaced,
    );
    if (result.unsupported.length) {
      // Do not allow the projection to claim the old native context vanished.
      await deleteNativeConversationMemories(input.context, [
        { id: String(memory.id) },
      ]);
      throw new Error(
        "Native conversation replacement is unavailable for legacy memory ids.",
      );
    }
    return result;
  } catch (error) {
    await deleteNativeConversationMemories(input.context, [
      { id: String(memory.id) },
    ]).catch(() => undefined);
    throw error;
  }
}
