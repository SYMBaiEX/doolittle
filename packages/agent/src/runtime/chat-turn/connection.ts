import type { UUID } from "@elizaos/core";
import type { AgentExecutionContext } from "../chat";
import type { TurnState } from "./state";

const MAX_INITIALIZED_PER_RUNTIME = 1_024;
type InitializationCache = WeakMap<object, Map<string, Promise<void> | true>>;
const ensuredConnectionCache: InitializationCache = new WeakMap();
const ensuredParticipantCache: InitializationCache = new WeakMap();

function ensureOnce(
  cache: InitializationCache,
  runtime: object,
  identity: string,
  initialize: () => Promise<void>,
): Promise<void> | undefined {
  let entries = cache.get(runtime);
  if (!entries) {
    entries = new Map();
    cache.set(runtime, entries);
  }
  const memo = entries;
  const entry = memo.get(identity);
  if (entry === true) return;
  if (entry) return entry;

  const pending = Promise.resolve()
    .then(initialize)
    .then(
      () => {
        memo.set(identity, true);
        if (memo.size <= MAX_INITIALIZED_PER_RUNTIME) return;
        // Pending initializations always stay joinable. Evict only completed work.
        for (const [key, initialized] of memo) {
          if (initialized !== true) continue;
          memo.delete(key);
          break;
        }
      },
      (error) => {
        memo.delete(identity);
        throw error;
      },
    );
  memo.set(identity, pending);
  return pending;
}

export async function ensureTurnConnection(
  context: AgentExecutionContext,
  input: Parameters<typeof context.runtime.ensureConnection>[0],
): Promise<void> {
  if (typeof context.runtime.ensureConnection !== "function") {
    return;
  }

  const runtime = context.runtime;
  const connectionKey = JSON.stringify([
    input.entityId,
    input.roomId,
    input.worldId,
    input.source,
    input.channelId,
    input.messageServerId,
  ]);
  await ensureOnce(ensuredConnectionCache, runtime, connectionKey, () =>
    runtime.ensureConnection(input),
  );

  if (typeof context.runtime.ensureParticipantInRoom !== "function") {
    return;
  }

  const participantKey = `${runtime.agentId}:${String(input.roomId)}`;
  await ensureOnce(ensuredParticipantCache, runtime, participantKey, () =>
    runtime.ensureParticipantInRoom(
      runtime.agentId as UUID,
      input.roomId as UUID,
    ),
  );
}

export async function ensureLocalInteractiveSettingsState(
  context: AgentExecutionContext,
  turn: TurnState,
): Promise<void> {
  if (!turn.localInteractive) {
    return;
  }

  try {
    const world = await context.runtime.getWorld(turn.worldId as UUID);
    if (!world) {
      return;
    }

    const metadata =
      world.metadata && typeof world.metadata === "object"
        ? world.metadata
        : {};
    const hasSettings =
      "settings" in metadata &&
      metadata.settings &&
      typeof metadata.settings === "object";
    const ownership =
      metadata.ownership && typeof metadata.ownership === "object"
        ? metadata.ownership
        : {};
    const hasOwner =
      "ownerId" in ownership && ownership.ownerId === turn.entityId;

    if (!hasOwner && !hasSettings) {
      world.metadata = {
        ...metadata,
        ownership: {
          ...ownership,
          ownerId: turn.entityId,
        },
        settings: {},
      };
      await context.runtime.updateWorld(world);
      return;
    }

    if (!hasOwner) {
      world.metadata = {
        ...metadata,
        ownership: {
          ...ownership,
          ownerId: turn.entityId,
        },
      };
      await context.runtime.updateWorld(world);
      return;
    }

    if (!hasSettings) {
      world.metadata = {
        ...metadata,
        settings: {},
      };
      await context.runtime.updateWorld(world);
    }
  } catch {
    // Best effort only; chat should still proceed if local settings bootstrap fails.
  }
}
