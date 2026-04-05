import { initializeOnboarding, type UUID } from "@elizaos/core";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { TurnState } from "./state";

type OnboardingInitializer = typeof initializeOnboarding;

const ensuredConnectionCache = new WeakMap<object, Set<string>>();
const ensuredParticipantCache = new WeakMap<object, Set<string>>();

export async function ensureTurnConnection(
  context: AgentExecutionContext,
  input: Parameters<typeof context.runtime.ensureConnection>[0],
): Promise<void> {
  if (typeof context.runtime.ensureConnection !== "function") {
    return;
  }

  const runtimeKey = context.runtime as object;
  const connectionKey = [
    input.entityId,
    input.roomId,
    input.worldId,
    input.source,
    input.channelId,
    input.messageServerId,
  ].join(":");
  const ensuredConnections =
    ensuredConnectionCache.get(runtimeKey) ?? new Set<string>();
  if (!ensuredConnections.has(connectionKey)) {
    await context.runtime.ensureConnection(input);
    ensuredConnections.add(connectionKey);
    ensuredConnectionCache.set(runtimeKey, ensuredConnections);
  }

  if (typeof context.runtime.ensureParticipantInRoom !== "function") {
    return;
  }

  const participantKey = `${context.runtime.agentId}:${String(input.roomId)}`;
  const ensuredParticipants =
    ensuredParticipantCache.get(runtimeKey) ?? new Set<string>();
  if (ensuredParticipants.has(participantKey)) {
    return;
  }
  await context.runtime.ensureParticipantInRoom(
    context.runtime.agentId as UUID,
    input.roomId as UUID,
  );
  ensuredParticipants.add(participantKey);
  ensuredParticipantCache.set(runtimeKey, ensuredParticipants);
}

export async function ensureLocalInteractiveSettingsState(
  context: AgentExecutionContext,
  turn: TurnState,
  opts?: { initializeOnboarding?: OnboardingInitializer },
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

    if (!hasOwner) {
      world.metadata = {
        ...metadata,
        ownership: {
          ...ownership,
          ownerId: turn.entityId,
        },
      };
      await context.runtime.updateWorld(world);
    }
    if (!hasSettings) {
      const initializer = opts?.initializeOnboarding ?? initializeOnboarding;
      await initializer(context.runtime, world, {
        settings: {},
      });
    }
  } catch {
    // Best effort only; chat should still proceed if local settings bootstrap fails.
  }
}
