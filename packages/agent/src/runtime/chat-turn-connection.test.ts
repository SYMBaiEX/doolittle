import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import {
  ensureLocalInteractiveSettingsState,
  ensureTurnConnection,
} from "./chat-turn/connection";
import type { TurnState } from "./chat-turn/state";

function createContextForConnection() {
  const ensureCalls: Array<{
    source: string;
    input: Parameters<
      NonNullable<AgentExecutionContext["runtime"]["ensureConnection"]>
    >[0];
  }> = [];
  const ensureParticipants: Array<{ entityId: string; roomId: string }> = [];

  const context = {
    runtime: {
      ensureConnection: async (input: {
        entityId: string;
        roomId: string;
        worldId: string;
        messageServerId: string;
        channelId: string;
        source: string;
      }) => {
        ensureCalls.push({
          source: "ensure-connection",
          input,
        });
      },
      ensureParticipantInRoom: async (entityId: string, roomId: string) => {
        ensureParticipants.push({ entityId, roomId });
      },
      agentId: "agent-1",
      getWorld: async () => null,
      updateWorld: async () => undefined,
    },
    services: {
      settings: {
        get: () => ({}),
      },
    },
  } as unknown as AgentExecutionContext;

  return { context, ensureCalls, ensureParticipants };
}

function createTurn(overrides: Record<string, unknown> = {}) {
  return {
    entityId: "entity-1",
    roomId: "room-1",
    worldId: "world-1",
    settings: {},
    ...overrides,
  } as {
    entityId: string;
    roomId: string;
    worldId: string;
    localInteractive?: boolean;
    settings: Record<string, unknown>;
  };
}

describe("chat turn connection seam", () => {
  it("deduplicates connection and participant setup for identical inputs", async () => {
    const { context, ensureCalls, ensureParticipants } =
      createContextForConnection();
    const payload = {
      entityId: "entity-1",
      roomId: "room-1",
      worldId: "world-1",
      source: "cli",
      channelId: "channel-1",
      messageServerId: "server-1",
    };

    await ensureTurnConnection(context, payload);
    await ensureTurnConnection(context, payload);

    expect(ensureCalls).toHaveLength(1);
    expect(ensureParticipants).toHaveLength(1);
    expect(ensureCalls[0]?.input).toEqual(payload);
    expect(ensureParticipants[0]).toEqual({
      entityId: "agent-1",
      roomId: payload.roomId,
    });
  });

  it("respects local-interactive settings bootstrap hook", async () => {
    const worlds: Array<{
      metadata: Record<string, unknown> | undefined;
      ownership?: Record<string, unknown>;
    }> = [];
    let initializerCalls = 0;
    const context = {
      runtime: {
        ensureConnection: async () => undefined,
        ensureParticipantInRoom: async () => undefined,
        agentId: "agent-1",
        getWorld: async () => ({
          worldId: "world-1",
          metadata: {},
        }),
        updateWorld: async (world: { metadata: Record<string, unknown> }) => {
          worlds.push(world);
        },
      },
      services: {
        settings: {
          get: () => ({}),
        },
      },
    } as unknown as AgentExecutionContext;
    const turn = createTurn();
    const turnState = {
      ...turn,
      agentName: "Doolittle",
      connectionSource: "cli",
      sessionId: "session-1",
      roomId: "room-1",
      messageServerId: "server-1",
      runId: "run-1",
      localInteractive: true,
    } as unknown as TurnState;

    await ensureLocalInteractiveSettingsState(context, turnState, {
      initializeOnboarding: async () => {
        initializerCalls += 1;
        return null;
      },
    });

    expect(initializerCalls).toBe(1);
    expect(worlds).toHaveLength(1);
    expect(worlds[0]).toMatchObject({
      metadata: {
        ownership: {
          ownerId: "entity-1",
        },
      },
    });
  });
});
