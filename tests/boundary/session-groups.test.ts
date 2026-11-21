import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChannelType } from "@elizaos/core";
import { expect, it, vi } from "vitest";
import type { BotProcessRegistry } from "../../apps/desktop/src/main/bot-process-registry";
import {
  assertBotSessionRequest,
  attributeBotSessionResponse,
} from "../../apps/desktop/src/main/bot-session-routing";
import { parseApiPath } from "../../apps/desktop/src/main/ipc/agent-api-policy";
import type {
  AgentTransportRequest,
  AgentTransportResponse,
  SessionsResponse,
} from "../../apps/desktop/src/shared/contracts";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/types";
import { stableRuntimeUuid } from "../../packages/agent/src/runtime/stable-runtime-uuid";
import { handleSessionRoutes } from "../../packages/agent/src/server/routes/sessions";
import { GatewaySessionService } from "../../packages/agent/src/services/gateway-session-service";
import { SessionService } from "../../packages/agent/src/services/session/service";

it("identifies shared gateway and Eliza rooms only from their saved conversation identities", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doolittle-session-groups-"));
  try {
    const sessions = new SessionService(dir);
    const gatewaySessions = new GatewaySessionService(join(dir, "gateway"));
    const { sessionKey: group } = gatewaySessions.resolve({
      platform: "telegram",
      roomId: "-100123",
      userId: "456",
      metadata: { accountId: "fixture bot", chatType: "supergroup" },
      text: "Shared chat",
    });
    const { sessionKey: dm } = gatewaySessions.resolve({
      platform: "telegram",
      roomId: "456",
      userId: "456",
      channelType: "private",
      text: "Direct chat",
    });
    gatewaySessions.setActiveAgentSession(group, "unrelated");
    for (const sessionId of [group, dm, "native-group", "unrelated"]) {
      sessions.storeMessage({
        id: `message-${sessionId}`,
        sessionId,
        roomId: stableRuntimeUuid(sessionId),
        entityId: "speaker",
        role: "user",
        text: sessionId,
        createdAt: "2026-11-21T10:00:00.000Z",
      });
    }
    const getRoomsByIds = vi.fn().mockResolvedValue([
      { id: stableRuntimeUuid("native-group"), type: ChannelType.GROUP },
      { id: stableRuntimeUuid("unrelated"), type: ChannelType.DM },
    ]);
    const context = {
      services: { sessions, gatewaySessions },
      runtime: { adapter: { getRoomsByIds } },
    } as unknown as AppContext;
    const call = async (path: string) => {
      const url = new URL(path, "http://localhost");
      const response = await handleSessionRoutes(
        context,
        new Request(url),
        url,
      );
      expect(response?.status).toBe(200);
      return response?.json();
    };

    expect((await call("/sessions")).sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: group,
          conversationKind: "group",
        }),
        expect.objectContaining({
          sessionId: "native-group",
          conversationKind: "group",
        }),
      ]),
    );
    const { sessions: rows } = (await call("/sessions")) as SessionsResponse;
    expect(
      rows.filter(({ conversationKind }) => conversationKind),
    ).toHaveLength(2);
    expect(rows).toHaveLength(4);
    const firstPage = (await call("/sessions?limit=2")) as SessionsResponse;
    const secondPage = (await call(
      "/sessions?limit=2&offset=2",
    )) as SessionsResponse;
    expect(firstPage).toEqual({ sessions: rows.slice(0, 2), hasMore: true });
    expect(secondPage).toEqual({ sessions: rows.slice(2), hasMore: false });
    expect(
      (await call(`/sessions/summary?sessionId=${encodeURIComponent(group)}`))
        .summary,
    ).toMatchObject({ sessionId: group, conversationKind: "group" });

    getRoomsByIds.mockRejectedValueOnce(new Error("SDK adapter unavailable"));
    const { sessions: recoveredRows } = (await call(
      "/sessions",
    )) as SessionsResponse;
    expect(recoveredRows).toHaveLength(4);
    expect(
      recoveredRows.filter(({ conversationKind }) => conversationKind),
    ).toEqual([expect.objectContaining({ sessionId: group })]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("lists opaque lead transcripts as read-only without adding ledger or write access", async () => {
  const sessionId = `telegram:-100123:456:root:account=${"fixture%20".repeat(12)}`;
  const bindConversation = vi.fn();
  const assertLegacyLeadTranscript = vi.fn(async (botId: string) => {
    if (botId !== "default")
      throw new Error("Named conversations require ownership.");
  });
  const registry = {
    get: (botId: string) => ({ isDefault: botId === "default" }),
    catalog: { stableDefaultBotId: () => "lead-agent" },
    assertLegacyLeadTranscript,
    bindConversation,
  } as unknown as BotProcessRegistry;
  const path = `/sessions/messages?sessionId=${encodeURIComponent(sessionId)}`;
  const read = {
    method: "GET",
    path,
    requestId: "read-history",
    headers: {},
  } satisfies AgentTransportRequest;
  expect(parseApiPath(path, "GET")).toBe(path);
  await assertBotSessionRequest(registry, read, "default");
  expect(assertLegacyLeadTranscript).toHaveBeenCalledWith("default", sessionId);
  await expect(
    assertBotSessionRequest(registry, read, "named"),
  ).rejects.toThrow("Named conversations require ownership");

  const list = {
    method: "GET",
    path: "/sessions?limit=50&offset=100",
    requestId: "list-history",
    headers: {},
  } satisfies AgentTransportRequest;
  expect(parseApiPath(list.path, "GET")).toBe(list.path);
  const response: AgentTransportResponse = {
    status: 200,
    statusText: "OK",
    headers: {},
    body: JSON.stringify({
      sessions: [
        {
          sessionId,
          conversationKind: "group",
          workspacePath: "/untrusted-root",
        },
      ],
      hasMore: true,
    }),
  };
  const attributed = await attributeBotSessionResponse(
    registry,
    list,
    "default",
    response,
  );
  expect(JSON.parse(attributed.body)).toEqual({
    sessions: [
      {
        sessionId,
        botId: "lead-agent",
        conversationKind: "group",
        readOnly: true,
      },
    ],
    hasMore: true,
  });
  await expect(
    attributeBotSessionResponse(registry, list, "named", response),
  ).rejects.toThrow("This named conversation is not bound to its bot.");
  expect(bindConversation).not.toHaveBeenCalled();
  await expect(
    assertBotSessionRequest(
      registry,
      {
        method: "POST",
        path: "/sessions/title",
        requestId: "rename-history",
        headers: {},
        body: JSON.stringify({ sessionId, title: "renamed" }),
      },
      "default",
    ),
  ).rejects.toThrow("A valid conversation ID is required.");
});
