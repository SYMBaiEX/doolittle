import { describe, expect, it, vi } from "vitest";
import { handleBotApiRequest } from "./bot-api";
import type { BotProcessRegistry } from "./bot-process-registry";

const record = {
  dispatchId: "dispatch-1",
  rootRunId: "root-1",
  targetBotId: "worker-1",
  targetSessionId: "session-1",
  targetRunId: "consult:dispatch-1",
  origin: {
    botId: "lead-1",
    agentId: "lead-1",
    sessionId: "lead-session",
    runId: "root-1",
  },
  status: "accepted",
  createdAt: "2026-10-04T00:00:00.000Z",
};

function registry(targetBound = true, rootOwned = true): BotProcessRegistry {
  return {
    get: () => ({ isDefault: true }),
    consultations: {
      ledger: {
        byTargetRun: (id: string) =>
          id === record.targetRunId ? record : undefined,
        forRoot: () => [record],
      },
    },
    conversations: {
      getRun: (id: string) =>
        id === record.targetRunId
          ? targetBound
            ? { botId: record.targetBotId, sessionId: record.targetSessionId }
            : undefined
          : rootOwned
            ? { botId: "lead-1" }
            : undefined,
    },
    catalog: { stableDefaultBotId: () => "lead-1" },
    assertRunOwner: async () => undefined,
  } as unknown as BotProcessRegistry;
}

describe("consultation recovery API", () => {
  const request = {
    method: "GET" as const,
    requestId: "recovery",
    path: "/bots/consultations?targetRunId=consult:dispatch-1",
    headers: {},
  };

  it("returns only a ledger-bound child after verifying its lead root", async () => {
    const response = await handleBotApiRequest(registry(), request);
    expect(response?.status).toBe(200);
    expect(JSON.parse(response?.body ?? "{}").consultations).toEqual([
      expect.objectContaining({
        rootRunId: "root-1",
        target: {
          botId: "worker-1",
          sessionId: "session-1",
          runId: "consult:dispatch-1",
        },
      }),
    ]);
    expect(response?.body).not.toContain("objective");
  });

  it("fails closed for a child without a saved target binding or lead root", async () => {
    expect((await handleBotApiRequest(registry(false), request))?.status).toBe(
      404,
    );
    expect(
      (await handleBotApiRequest(registry(true, false), request))?.status,
    ).toBe(404);
  });
});

describe("knowledge API", () => {
  const promoteRequest = {
    method: "POST" as const,
    requestId: "promote",
    path: "/bots/knowledge/promote",
    headers: {},
    body: JSON.stringify({
      sourceBotId: "source",
      sessionId: "session-1",
      runId: "run-1",
      messageId: "message-1",
      projectId: "project-1",
      title: "Selected finding",
      consent: true,
    }),
  };

  it("requires native confirmation before copying a selected message", async () => {
    const promote = vi.fn(async () => ({ id: "knowledge-1" }));
    const bots = {
      get: () => ({ isDefault: true }),
      knowledge: { promote },
    } as unknown as BotProcessRegistry;
    expect((await handleBotApiRequest(bots, promoteRequest))?.status).toBe(403);
    expect(promote).not.toHaveBeenCalled();
    const confirm = vi.fn(async () => true);
    const response = await handleBotApiRequest(bots, promoteRequest, confirm);
    expect(response?.status).toBe(201);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "knowledge-promotion" }),
    );
    expect(promote).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBotId: "source", consent: true }),
    );
  });

  it("rejects an incomplete source before confirmation and denies unconfirmed grants", async () => {
    const grant = vi.fn();
    const bots = {
      get: () => ({ isDefault: true }),
      knowledge: {
        grant,
        ledger: { get: () => ({ id: "knowledge-1" }) },
      },
    } as unknown as BotProcessRegistry;
    const confirm = vi.fn(async () => true);
    const invalid = await handleBotApiRequest(
      bots,
      {
        ...promoteRequest,
        body: JSON.stringify({ title: "Finding", consent: true }),
      },
      confirm,
    );
    expect(invalid?.status).toBe(400);
    expect(confirm).not.toHaveBeenCalled();
    const grantRequest = {
      ...promoteRequest,
      path: "/bots/knowledge/00000000-0000-4000-8000-000000000001/grant",
      body: JSON.stringify({ targetBotId: "target", consent: true }),
    };
    expect((await handleBotApiRequest(bots, grantRequest))?.status).toBe(403);
    expect(grant).not.toHaveBeenCalled();
    expect(
      (await handleBotApiRequest(bots, grantRequest, confirm))?.status,
    ).toBe(200);
    expect(grant).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "target",
      true,
    );
  });
});
