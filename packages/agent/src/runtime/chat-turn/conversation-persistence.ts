import { randomUUID } from "node:crypto";
import {
  ChannelType,
  type Content,
  createUniqueUuid,
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

/** JSONB preserves values but not object key insertion order. Use a typed,
 * recursive representation so cleanup accepts adapter-normalized metadata
 * without ever treating a different value as the memory we created. */
function canonicalMemoryValue(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return `boolean:${value}`;
    case "number":
      return `number:${String(value)}`;
    case "string":
      return `string:${JSON.stringify(value)}`;
    case "undefined":
      return "undefined";
    case "bigint":
      return `bigint:${value.toString()}`;
    case "object": {
      if (Array.isArray(value)) {
        return `array:[${value.map(canonicalMemoryValue).join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      return `object:{${Object.keys(record)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${canonicalMemoryValue(record[key])}`,
        )
        .join(",")}}`;
    }
    default:
      return `${typeof value}:${String(value)}`;
  }
}

function hasSameCreatedMemoryIdentity(
  persisted: Memory,
  memory: Memory,
): boolean {
  return (
    String(persisted.agentId) === String(memory.agentId) &&
    String(persisted.entityId) === String(memory.entityId) &&
    String(persisted.roomId) === String(memory.roomId) &&
    canonicalMemoryValue(persisted.content) ===
      canonicalMemoryValue(memory.content) &&
    canonicalMemoryValue(persisted.metadata) ===
      canonicalMemoryValue(memory.metadata)
  );
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

async function restoreNativeMemorySnapshot(
  context: AgentExecutionContext,
  memory: Memory,
): Promise<void> {
  if (typeof context.runtime.createMemory !== "function") {
    throw new Error("Native conversation restoration is unavailable.");
  }
  await context.runtime.createMemory(memory, "messages");
  if (typeof context.runtime.queueEmbeddingGeneration === "function") {
    await context.runtime.queueEmbeddingGeneration(
      memory,
      roleForMemory(context, memory) === "user" ? "high" : "normal",
    );
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

function canReadMemories(
  runtime: AgentExecutionContext["runtime"],
): runtime is AgentExecutionContext["runtime"] & {
  getMemories(params: {
    roomId: UUID;
    tableName: string;
    limit: number;
    offset: number;
    orderBy: string;
    orderDirection: "asc" | "desc";
    includeEmbedding: boolean;
  }): Promise<Memory[]>;
} {
  return typeof runtime.getMemories === "function";
}

function hasAnyNativeMemoryMutationCapability(
  runtime: AgentExecutionContext["runtime"],
): boolean {
  return (
    typeof runtime.createMemory === "function" ||
    canReadMemories(runtime) ||
    canDeleteMemory(runtime)
  );
}

function assertCompleteNativeMemoryMutationCapability(
  runtime: AgentExecutionContext["runtime"],
): void {
  if (
    typeof runtime.createMemory !== "function" ||
    !canReadMemories(runtime) ||
    !canDeleteMemory(runtime)
  ) {
    throw new Error(
      "Native conversation replacement requires create, read, and delete memory capabilities.",
    );
  }
}

async function nativeMemoriesInRoom(
  context: AgentExecutionContext,
  roomId: UUID,
): Promise<Memory[]> {
  if (!canReadMemories(context.runtime)) return [];
  const memories: Memory[] = [];
  const seenPages = new Set<string>();
  let offset = 0;

  for (;;) {
    const page = await context.runtime.getMemories({
      roomId,
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

  return memories;
}

async function nativeConversationMemories(
  context: AgentExecutionContext,
  turn: TurnState,
): Promise<Memory[]> {
  return (await nativeMemoriesInRoom(context, turn.roomId as UUID)).reverse();
}

/**
 * The installed Eliza runtime exposes deleteMemory. Keep this capability
 * check at the boundary so old test doubles and older compatible runtimes
 * degrade safely rather than making SQLite pretend a native deletion happened.
 */
export async function deleteNativeConversationMemories(
  context: AgentExecutionContext,
  messages: ReadonlyArray<
    Pick<StoredMessage, "id"> & Partial<Pick<StoredMessage, "roomId">>
  >,
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
  const ids = [
    ...new Set(
      messages
        .map((message) => message.id)
        .filter((id) => UUID_PATTERN.test(id)),
    ),
  ];
  const unsupported = messages
    .map((message) => message.id)
    .filter((id) => !UUID_PATTERN.test(id));
  if (!ids.length) return { deleted: [], unsupported };
  if (!canDeleteMemory(runtime)) {
    return { deleted: [], unsupported: [...unsupported, ...ids] };
  }
  if (typeof runtime.createMemory !== "function") {
    throw new Error(
      "Native conversation deletion requires memory creation for rollback.",
    );
  }
  if (!canReadMemories(runtime)) {
    throw new Error(
      "Native conversation deletion requires readable memory snapshots for rollback.",
    );
  }

  const roomsById = new Map(
    messages
      .filter(
        (message): message is Pick<StoredMessage, "id" | "roomId"> =>
          UUID_PATTERN.test(message.id) && Boolean(message.roomId),
      )
      .map((message) => [message.id, message.roomId]),
  );
  if (ids.some((id) => !roomsById.has(id))) {
    throw new Error(
      "Native conversation deletion requires the original memory room for rollback.",
    );
  }

  const snapshotsById = new Map<string, Memory>();
  for (const roomId of new Set(roomsById.values())) {
    for (const memory of await nativeMemoriesInRoom(context, roomId as UUID)) {
      const id = String(memory.id);
      if (roomsById.get(id) === roomId) {
        snapshotsById.set(id, structuredClone(memory));
      }
    }
  }
  const missingSnapshots = ids.filter((id) => !snapshotsById.has(id));
  if (missingSnapshots.length) {
    throw new Error(
      `Native conversation deletion could not snapshot ${missingSnapshots.length} target ${missingSnapshots.length === 1 ? "memory" : "memories"} for rollback.`,
    );
  }

  const deleted: string[] = [];
  try {
    for (const id of ids) {
      await runtime.deleteMemory(id as UUID);
      deleted.push(id);
    }
  } catch (deleteError) {
    try {
      // Re-read only the affected rooms before restoring. If a newer writer has
      // already recreated an ID, do not overwrite that unrelated memory.
      const currentIds = new Set<string>();
      for (const roomId of new Set(roomsById.values())) {
        for (const memory of await nativeMemoriesInRoom(
          context,
          roomId as UUID,
        )) {
          currentIds.add(String(memory.id));
        }
      }
      // A rejected adapter call may still have committed its deletion. Restore
      // every target now absent, not only calls that resolved successfully.
      for (const snapshot of snapshotsById.values()) {
        if (!currentIds.has(String(snapshot.id))) {
          await restoreNativeMemorySnapshot(context, snapshot);
        }
      }
    } catch (rollbackError) {
      throw new Error(
        `Native conversation deletion failed after deleting ${deleted.length} ${deleted.length === 1 ? "memory" : "memories"}, and rollback failed.`,
        { cause: new AggregateError([deleteError, rollbackError]) },
      );
    }
    throw new Error(
      `Native conversation deletion failed after deleting ${deleted.length} ${deleted.length === 1 ? "memory" : "memories"}; deleted memories were restored.`,
      { cause: deleteError },
    );
  }
  return { deleted, unsupported };
}

export async function snapshotNativeConversationMemories(
  context: AgentExecutionContext,
  messages: ReadonlyArray<
    Pick<StoredMessage, "id"> & Partial<Pick<StoredMessage, "roomId">>
  >,
): Promise<Memory[]> {
  if (!canReadMemories(context.runtime)) return [];
  const targets = new Map(
    messages
      .filter(
        (message): message is Pick<StoredMessage, "id" | "roomId"> =>
          UUID_PATTERN.test(message.id) && Boolean(message.roomId),
      )
      .map((message) => [message.id, message.roomId]),
  );
  const snapshots: Memory[] = [];
  for (const roomId of new Set(targets.values())) {
    for (const memory of await nativeMemoriesInRoom(context, roomId as UUID)) {
      if (targets.get(String(memory.id)) === roomId) {
        snapshots.push(structuredClone(memory));
      }
    }
  }
  return snapshots;
}

/** Restore only absent IDs. A concurrent writer that recreated an ID owns it. */
export async function restoreNativeConversationMemories(
  context: AgentExecutionContext,
  snapshots: ReadonlyArray<Memory>,
): Promise<void> {
  if (!snapshots.length) return;
  if (
    !canReadMemories(context.runtime) ||
    typeof context.runtime.createMemory !== "function"
  ) {
    throw new Error("Native conversation restoration is unavailable.");
  }
  const currentIds = new Set<string>();
  for (const roomId of new Set(snapshots.map((snapshot) => snapshot.roomId))) {
    for (const memory of await nativeMemoriesInRoom(context, roomId)) {
      currentIds.add(String(memory.id));
    }
  }
  for (const snapshot of snapshots) {
    if (!currentIds.has(String(snapshot.id))) {
      await restoreNativeMemorySnapshot(context, snapshot);
    }
  }
}

/** Remove only memories created by one failed replay, then restore its original
 * exchange. The replay message ID is freshly generated inside the room queue;
 * response memories are tied to it through the raw or SDK-normalized reply ID.
 * Re-reading each candidate before deletion prevents cleanup from overwriting a
 * memory that another writer recreated with different content. */
export async function rollbackNativeConversationReplay(input: {
  context: AgentExecutionContext;
  roomId: UUID;
  replayMessageId: UUID;
  originalSnapshots: ReadonlyArray<Memory>;
}): Promise<void> {
  if (
    !canReadMemories(input.context.runtime) ||
    !canDeleteMemory(input.context.runtime)
  ) {
    if (input.originalSnapshots.length) {
      throw new Error("Native conversation replay cleanup is unavailable.");
    }
    return;
  }

  const sdkReplyId = createUniqueUuid(
    input.context.runtime,
    input.replayMessageId,
  );
  const replayMemories = (
    await nativeMemoriesInRoom(input.context, input.roomId)
  ).filter((memory) => {
    if (String(memory.id) === String(input.replayMessageId)) return true;
    const inReplyTo = memory.content?.inReplyTo;
    return (
      String(inReplyTo ?? "") === String(input.replayMessageId) ||
      String(inReplyTo ?? "") === String(sdkReplyId)
    );
  });

  const rollbackErrors: unknown[] = [];
  for (const memory of replayMemories) {
    try {
      await deleteCreatedNativeMemory(input.context, memory);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  try {
    await restoreNativeConversationMemories(
      input.context,
      input.originalSnapshots,
    );
  } catch (error) {
    rollbackErrors.push(error);
  }
  if (rollbackErrors.length) {
    throw new Error("Native conversation replay rollback was incomplete.", {
      cause: new AggregateError(rollbackErrors),
    });
  }
}

async function deleteCreatedNativeMemory(
  context: AgentExecutionContext,
  memory: Memory,
): Promise<void> {
  const runtime = context.runtime;
  if (!canDeleteMemory(runtime) || !canReadMemories(runtime)) {
    throw new Error("Native conversation summary cleanup is unavailable.");
  }
  const persisted = (
    await nativeMemoriesInRoom(context, memory.roomId as UUID)
  ).find((candidate) => String(candidate.id) === String(memory.id));
  if (!persisted) return;
  if (!hasSameCreatedMemoryIdentity(persisted, memory)) {
    throw new Error(
      "Native conversation summary cleanup refused to remove a concurrent memory.",
    );
  }
  try {
    await runtime.deleteMemory(memory.id as UUID);
  } catch (deleteError) {
    const remains = (
      await nativeMemoriesInRoom(context, memory.roomId as UUID)
    ).some((candidate) => String(candidate.id) === String(memory.id));
    if (!remains) return;
    throw deleteError;
  }
  const remains = (
    await nativeMemoriesInRoom(context, memory.roomId as UUID)
  ).some((candidate) => String(candidate.id) === String(memory.id));
  if (remains) {
    throw new Error(
      "Native conversation summary cleanup did not remove memory.",
    );
  }
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
}): Promise<{ unsupported: string[]; rollback: () => Promise<void> }> {
  if (!hasAnyNativeMemoryMutationCapability(input.context.runtime)) {
    // Narrow legacy/test hosts without native memory persistence intentionally
    // keep the SQLite projection as their only transcript authority.
    return { unsupported: [], rollback: async () => undefined };
  }
  // A partially capable runtime cannot compensate a write. Reject before the
  // summary is persisted so native history is never left with an orphan.
  assertCompleteNativeMemoryMutationCapability(input.context.runtime);
  const memory = nativeMemoryFromProjection(
    input.context,
    input.turn,
    input.summary,
  );
  const replacedSnapshots = await snapshotNativeConversationMemories(
    input.context,
    input.replaced,
  );
  const rollback = async () => {
    try {
      await deleteCreatedNativeMemory(input.context, memory);
      await restoreNativeConversationMemories(input.context, replacedSnapshots);
    } catch (error) {
      throw new Error("Native conversation replacement rollback failed.", {
        cause: error,
      });
    }
  };
  try {
    await persistNativeMemory(input.context, memory, "normal");
    const result = await deleteNativeConversationMemories(
      input.context,
      input.replaced,
    );
    if (result.unsupported.length) {
      // Do not allow the projection to claim the old native context vanished.
      throw new Error(
        "Native conversation replacement is unavailable for legacy memory ids.",
      );
    }
    return { ...result, rollback };
  } catch (error) {
    try {
      await rollback();
    } catch (cleanupError) {
      throw new Error(
        "Native conversation replacement failed and its summary could not be removed.",
        { cause: new AggregateError([error, cleanupError]) },
      );
    }
    throw error;
  }
}
