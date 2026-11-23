import type { AgentRuntime, UUID } from "@elizaos/core";
import {
  projectedSearchMessages,
  searchableRooms,
  searchLegacyMessages,
  unverifiedSearchMessages,
} from "../services/session/messages/search";
import { SessionService } from "../services/session/service/index";
import { getSessionServiceState } from "../services/session/service/state";
import type { SessionSearchResult } from "../types/index";
import { stableRuntimeUuid } from "./stable-runtime-uuid";

const MAX_SEARCH_ROOMS = 2_000;
const MAX_PROOF_IDS = 256;
const MAX_PROOF_IDS_PER_ROOM = 32;
const MAX_QUERY_LENGTH = 1_024;
const MAX_HIT_LENGTH = 4_096;
const MEMORY_ID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

type SearchRuntime = Pick<AgentRuntime, "agentId"> &
  Partial<Pick<AgentRuntime, "getMemoriesByIds" | "searchMessages">>;

export async function searchSessionMessages(
  runtime: SearchRuntime | undefined,
  sessions: Pick<SessionService, "search">,
  query: string,
  requestedLimit: number,
  projectId?: string,
): Promise<SessionSearchResult[]> {
  const term = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!term) return [];
  const limit =
    Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(100, requestedLimit)
      : 20;
  const legacySearch = () =>
    sessions.search(term, limit, projectId).map((hit) => ({
      ...hit,
      text: hit.text.slice(0, MAX_HIT_LENGTH),
    }));
  if (
    typeof runtime?.searchMessages !== "function" ||
    !runtime.agentId ||
    !(sessions instanceof SessionService)
  ) {
    return legacySearch();
  }

  const { db } = getSessionServiceState(sessions);
  const rooms = searchableRooms(db, MAX_SEARCH_ROOMS + 1, projectId);
  if (rooms.length > MAX_SEARCH_ROOMS) return legacySearch();

  // Keep native and legacy rooms disjoint. An imported room can still point
  // to its source, and a projected user message can precede the SDK write.
  const ownedRooms = new Map<UUID, string>();
  const verifyRooms = new Map<
    UUID,
    { sessionId: string; texts: Map<UUID, string> }
  >();
  let remainingProofIds = MAX_PROOF_IDS;
  for (const room of rooms) {
    const canonical = stableRuntimeUuid(room.sessionId);
    if (room.roomId !== canonical) continue;
    const hasCheckpoint = room.checkpointAgent === runtime.agentId;
    if (hasCheckpoint && room.checkpointCoversLatest) {
      ownedRooms.set(canonical, room.sessionId);
      continue;
    }
    const proofLimit = Math.min(remainingProofIds, MAX_PROOF_IDS_PER_ROOM);
    if (
      !runtime.getMemoriesByIds ||
      !proofLimit ||
      (!hasCheckpoint && room.messageCount > proofLimit)
    )
      continue;
    const tail = unverifiedSearchMessages(
      db,
      room,
      runtime.agentId,
      proofLimit + 1,
    );
    remainingProofIds -= Math.min(tail.length, proofLimit);
    const ids = tail.map(({ id }) => id);
    if (
      !ids.length ||
      ids.length > proofLimit ||
      tail.some(({ roomId }) => roomId !== canonical) ||
      !ids.every((id): id is UUID => MEMORY_ID.test(id))
    )
      continue;
    verifyRooms.set(canonical, {
      sessionId: room.sessionId,
      texts: new Map(tail.map((message) => [message.id as UUID, message.text])),
    });
  }

  let native: Awaited<ReturnType<AgentRuntime["searchMessages"]>>;
  try {
    if (verifyRooms.size) {
      const ids = [...verifyRooms.values()].flatMap((room) => [
        ...room.texts.keys(),
      ]);
      const memories = await runtime.getMemoriesByIds?.(ids, "messages");
      const verifiedRooms = new Map(
        memories
          ?.filter((memory) => memory.agentId === runtime.agentId)
          .map((memory) => [memory.id, memory]),
      );
      for (const [roomId, room] of verifyRooms) {
        if (
          [...room.texts].every(([id, text]) => {
            const memory = verifiedRooms.get(id);
            return memory?.roomId === roomId && memory.content.text === text;
          })
        )
          ownedRooms.set(roomId, room.sessionId);
      }
    }
    if (!ownedRooms.size) return legacySearch();
    native = await runtime.searchMessages({
      roomIds: [...ownedRooms.keys()],
      query: term,
      tableName: "messages",
      // Hidden planner messages can also match. Overfetch a bounded window
      // and keep only displayed product messages confirmed by ID below.
      limit: limit * 3,
    });
  } catch {
    return legacySearch();
  }

  const visible = new Map(
    projectedSearchMessages(
      db,
      native.flatMap(({ memory }) => (memory.id ? [memory.id] : [])),
      projectId,
    ).map((hit) => [hit.messageId, hit]),
  );
  const results: SessionSearchResult[] = [];
  const seen = new Set<string>();
  for (const { memory } of native) {
    if (!memory.id || seen.has(memory.id) || memory.agentId !== runtime.agentId)
      continue;
    const hit = visible.get(memory.id);
    if (
      !hit ||
      hit.roomId !== memory.roomId ||
      ownedRooms.get(memory.roomId) !== hit.sessionId
    )
      continue;
    // The SDK also indexes attachment titles and URLs. Use the visible text
    // index when an attachment could have produced the match.
    if (memory.content?.text !== hit.text || memory.content.attachments?.length)
      return legacySearch();
    results.push({
      sessionId: hit.sessionId,
      projectId: hit.projectId,
      createdAt: hit.createdAt,
      role: hit.role,
      text: hit.text.slice(0, MAX_HIT_LENGTH),
    });
    seen.add(memory.id);
    if (results.length === limit) return results;
  }

  // If hidden SDK memories filled the overfetch window, the legacy index can
  // recover displayed matches that ranked outside that window.
  if (native.length === limit * 3) return legacySearch();
  if (ownedRooms.size === rooms.length) return results;
  results.push(
    ...searchLegacyMessages(db, term, limit - results.length, projectId, [
      ...ownedRooms.values(),
    ]).map(({ messageId: _id, roomId: _roomId, ...hit }) => ({
      ...hit,
      text: hit.text.slice(0, MAX_HIT_LENGTH),
    })),
  );
  return results;
}
