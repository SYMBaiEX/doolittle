import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRuntime, ChannelType, type UUID } from "@elizaos/core";
import { createDatabaseAdapter, plugin } from "@elizaos/plugin-sql";
import { expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/types";
import { searchSessionMessages } from "../../packages/agent/src/runtime/session-search";
import { stableRuntimeUuid } from "../../packages/agent/src/runtime/stable-runtime-uuid";
import { handleSessionRoutes } from "../../packages/agent/src/server/routes/sessions";
import { SessionService } from "../../packages/agent/src/services/session/service";
import {
  getSessionServiceState,
  getTranscriptCheckpointStore,
} from "../../packages/agent/src/services/session/service/state";
import type { StoredMessage } from "../../packages/agent/src/types";

it("searches verified chats with ElizaOS and keeps imported and pending chats visible in the same project", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "doolittle-native-search-"));
  const agentId = randomUUID();
  const sessions = new SessionService(baseDir);
  const adapter = createDatabaseAdapter(
    { dataDir: join(baseDir, "pglite") },
    agentId,
  );
  const allowed = sessions.createProject({ name: "Allowed" });
  const outside = sessions.createProject({ name: "Outside" });
  const nativeSession = "local:native";
  const outsideSession = "local:outside";
  const importedSession = "local:imported";
  const pendingSession = "local:pending";
  const divergedSession = "local:diverged";
  const at = new Date(Date.UTC(2026, 0, 1)).toISOString();
  const runtime = new AgentRuntime({ agentId, adapter });

  function projected(
    sessionId: string,
    text: string,
    roomSeed = sessionId,
  ): StoredMessage {
    const record = {
      id: randomUUID(),
      sessionId,
      roomId: stableRuntimeUuid(roomSeed),
      entityId: agentId,
      role: "assistant" as const,
      text,
      createdAt: at,
    };
    sessions.storeMessage(record);
    sessions.assignSessionProject(
      sessionId,
      sessionId === outsideSession ? outside.id : allowed.id,
    );
    return record;
  }
  async function remember(row: StoredMessage, nativeText: string, id = row.id) {
    await runtime.createMemory(
      {
        id: id as UUID,
        roomId: row.roomId as UUID,
        entityId: agentId,
        agentId,
        content: { text: nativeText },
        createdAt: Date.parse(row.createdAt),
      },
      "messages",
    );
  }
  function searchRoute() {
    const url = new URL("https://localhost/sessions/search");
    url.searchParams.set("query", "marigold");
    url.searchParams.set("projectId", allowed.id);
    const context = {
      runtime,
      services: { sessions },
    } as unknown as AppContext;
    return handleSessionRoutes(context, new Request(url), url);
  }

  try {
    await adapter.initialize();
    await adapter.runPluginMigrations?.([
      { name: plugin.name, schema: plugin.schema ?? {} },
    ]);
    await adapter.createAgents([
      { id: agentId, name: "Search fixture", bio: [] },
    ]);
    await adapter.createEntities([
      { id: agentId, agentId, names: ["Search fixture"] },
    ]);
    await adapter.createRooms(
      [nativeSession, outsideSession, divergedSession].map((sessionId) => ({
        id: stableRuntimeUuid(sessionId),
        agentId,
        source: "doolittle",
        type: ChannelType.DM,
      })),
    );
    const visible = projected(nativeSession, "marigold native response");
    const other = projected(outsideSession, "marigold outside project");
    const imported = projected(
      importedSession,
      "marigold imported receipt",
      "local:source",
    );
    const pending = projected(pendingSession, "marigold pending native write");
    const diverged = projected(divergedSession, "marigold approved redaction");
    await remember(visible, visible.text);
    await remember(other, other.text);
    await remember(diverged, "marigold unapproved detail");
    await remember(visible, "marigold private planner trace", randomUUID());

    const searchMessages = vi.spyOn(runtime, "searchMessages");
    const readById = vi.spyOn(runtime, "getMemoriesByIds");
    const response = await searchRoute();
    expect(response).not.toBeNull();
    if (!response) throw new Error("Expected session search response");
    expect(response.status).toBe(200);
    const { hits } = await response.json();
    expect(hits).toHaveLength(4);
    expect(hits).toEqual(
      expect.arrayContaining([
        {
          sessionId: nativeSession,
          projectId: allowed.id,
          createdAt: at,
          role: "assistant",
          text: "marigold native response",
        },
        {
          sessionId: importedSession,
          projectId: allowed.id,
          createdAt: at,
          role: "assistant",
          text: imported.text,
        },
        {
          sessionId: pendingSession,
          projectId: allowed.id,
          createdAt: at,
          role: "assistant",
          text: pending.text,
        },
        {
          sessionId: divergedSession,
          projectId: allowed.id,
          createdAt: at,
          role: "assistant",
          text: diverged.text,
        },
      ]),
    );
    expect(readById).toHaveBeenCalledTimes(1);
    expect(readById).toHaveBeenCalledWith(
      expect.arrayContaining([visible.id, pending.id, diverged.id]),
      "messages",
    );
    expect(readById.mock.calls[0]?.[0]).toHaveLength(3);
    expect(searchMessages).toHaveBeenCalledWith({
      roomIds: [visible.roomId],
      query: "marigold",
      tableName: "messages",
      limit: 60,
    });

    searchMessages.mockRejectedValueOnce(
      new Error("Fixture native search failure"),
    );
    await expect(
      searchSessionMessages(runtime, sessions, "marigold", 20, allowed.id),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ text: visible.text })]),
    );
    expect(
      await searchSessionMessages(
        runtime,
        sessions,
        "outside project",
        20,
        allowed.id,
      ),
    ).toEqual([]);
  } finally {
    getSessionServiceState(sessions).db.close();
    await adapter.close();
    await rm(baseDir, { recursive: true, force: true });
  }
}, 20_000);

it("uses an existing native checkpoint without re-reading the projected history", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "doolittle-checkpoint-search-"));
  const sessions = new SessionService(baseDir);
  const agentId = randomUUID();
  const sessionId = "local:verified";
  const roomId = stableRuntimeUuid(sessionId);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const getMemoriesByIds = vi.fn();
  const searchMessages = vi.fn(async () => []);
  try {
    sessions.storeMessage({
      id,
      sessionId,
      roomId,
      entityId: agentId,
      role: "user",
      text: "obsolete",
      createdAt,
    });
    getTranscriptCheckpointStore(sessions)?.publishTranscriptCheckpoint(
      sessionId,
      {
        agentId,
        roomId,
        throughId: id,
        throughAt: createdAt,
        fingerprint: "fixture",
      },
      () => true,
    );
    expect(
      await searchSessionMessages(
        { agentId, searchMessages, getMemoriesByIds },
        sessions,
        "obsolete",
        20,
      ),
    ).toEqual([]);
    expect(searchMessages).toHaveBeenCalledTimes(1);
    expect(getMemoriesByIds).not.toHaveBeenCalled();
  } finally {
    getSessionServiceState(sessions).db.close();
    await rm(baseDir, { recursive: true, force: true });
  }
});
