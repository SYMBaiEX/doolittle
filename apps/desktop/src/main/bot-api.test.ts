import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { BotDefinition } from "@doolittle/contracts/bots";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleBotApiRequest } from "./bot-api";
import type { BotProcessRegistry } from "./bot-process-registry";
import { BotTeamCatalog } from "./bot-team-catalog";

const teamDirectories: string[] = [];
afterEach(() => {
  for (const dir of teamDirectories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("application-owned team API", () => {
  const memberId = "00000000-0000-4000-8000-000000000001";
  function fixture() {
    const dir = mkdtempSync(resolve(tmpdir(), "doolittle-team-api-"));
    teamDirectories.push(dir);
    let archived = false;
    const teams = new BotTeamCatalog(dir, (id) => {
      if (id !== memberId || archived)
        throw new Error("Unknown or archived member.");
      return { id } as BotDefinition;
    });
    const bots = {
      teams,
      get: (id: string) => ({ id, name: "Research bot", isDefault: false }),
    } as unknown as BotProcessRegistry;
    return {
      bots,
      teams,
      archiveBot: () => {
        archived = true;
      },
    };
  }
  const create = {
    method: "POST" as const,
    path: "/bots/teams",
    requestId: "team-create",
    headers: {},
    body: JSON.stringify({
      name: "Research",
      memberBotIds: [memberId],
      expectedRevision: 0,
      consent: true,
    }),
  };
  it("requires native confirmation and keeps the catalog application-global", async () => {
    const { bots, teams } = fixture();
    expect((await handleBotApiRequest(bots, create))?.status).toBe(403);
    const confirm = vi.fn(async () => true);
    expect(
      (await handleBotApiRequest(bots, { ...create, botId: memberId }, confirm))
        ?.status,
    ).toBe(400);
    expect(confirm).not.toHaveBeenCalled();
    const response = await handleBotApiRequest(bots, create, confirm);
    expect(response?.status).toBe(201);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "team-membership" }),
    );
    const team = JSON.parse(response?.body ?? "{}").team;
    expect(
      (
        await handleBotApiRequest(bots, {
          ...create,
          method: "GET",
          body: undefined,
        })
      )?.status,
    ).toBe(200);
    expect(
      (
        await handleBotApiRequest(
          bots,
          {
            ...create,
            path: `/bots/teams/${team.id}`,
            method: "PATCH",
            body: JSON.stringify({
              memberBotIds: [],
              expectedRevision: 1,
              consent: true,
            }),
          },
          confirm,
        )
      )?.status,
    ).toBe(200);
    expect(teams.get(team.id).memberBotIds).toEqual([]);
    expect(
      (
        await handleBotApiRequest(
          bots,
          {
            ...create,
            path: `/bots/teams/${team.id}/archive`,
            body: JSON.stringify({ expectedRevision: 2, consent: true }),
          },
          confirm,
        )
      )?.status,
    ).toBe(200);
    expect(() => teams.get(team.id)).toThrow("archived");
  });
  it("rechecks membership and revision after a pending native dialog", async () => {
    const { bots, teams, archiveBot } = fixture();
    expect(
      (
        await handleBotApiRequest(bots, create, async () => {
          archiveBot();
          return true;
        })
      )?.status,
    ).toBe(409);
    expect(teams.list().teams).toEqual([]);
    const fresh = fixture();
    expect(
      (
        await handleBotApiRequest(fresh.bots, create, async () => {
          fresh.teams.create({
            name: "Concurrent",
            memberBotIds: [memberId],
            expectedRevision: 0,
          });
          return true;
        })
      )?.status,
    ).toBe(409);
    expect(fresh.teams.list().teams.map((team) => team.name)).toEqual([
      "Concurrent",
    ]);
  });
  it("accepts team promotion only as an exclusive, confirmed scope", async () => {
    const promote = vi.fn(async (input) => ({
      ...input,
      scope: { kind: "team", id: input.teamId },
    }));
    const bots = {
      knowledge: { promote },
      teams: { get: () => ({ name: "Research" }) },
    } as unknown as BotProcessRegistry;
    const input = {
      sourceBotId: memberId,
      sessionId: "session",
      runId: "run",
      messageId: "message",
      teamId: memberId,
      title: "Finding",
      consent: true,
    };
    const request = {
      ...create,
      path: "/bots/knowledge/promote",
      body: JSON.stringify(input),
    };
    expect((await handleBotApiRequest(bots, request))?.status).toBe(403);
    expect(promote).not.toHaveBeenCalled();
    expect(
      (
        await handleBotApiRequest(
          bots,
          {
            ...request,
            body: JSON.stringify({ ...input, projectId: "project" }),
          },
          async () => true,
        )
      )?.status,
    ).toBe(400);
    expect(
      (await handleBotApiRequest(bots, request, async () => true))?.status,
    ).toBe(201);
    expect(promote).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: memberId,
        projectId: undefined,
        consent: true,
      }),
    );
  });
});

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
  it("names exact team scope and recipient in host consent instead of claiming project-only sharing", async () => {
    const grant = vi.fn();
    const scopeId = "00000000-0000-4000-8000-000000000003";
    const bots = {
      get: () => ({
        id: "target",
        name: "Research specialist",
        isDefault: true,
      }),
      teams: {
        list: () => ({ teams: [{ id: scopeId, name: "Research team" }] }),
      },
      knowledge: {
        grant,
        ledger: {
          get: () => ({
            id: "record",
            title: "Selected finding",
            scope: { kind: "team", id: scopeId },
          }),
        },
      },
    } as unknown as BotProcessRegistry;
    const confirm = vi.fn(
      async (
        _request: import("./ipc/ipc-validation").SensitiveActionConfirmationRequest,
      ) => true,
    );
    const response = await handleBotApiRequest(
      bots,
      {
        method: "POST",
        path: "/bots/knowledge/00000000-0000-4000-8000-000000000001/grant",
        requestId: "team-consent",
        headers: {},
        body: JSON.stringify({ consent: true, targetBotId: "target" }),
      },
      confirm,
    );
    expect(response?.status).toBe(200);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Research specialist"),
        detail: expect.stringContaining("team Research team"),
      }),
    );
    expect(confirm.mock.calls[0][0].detail).toContain("across projects");
  });
  it("exposes only grant metadata through the application-owned catalog", async () => {
    const list = vi.fn(() => [{ id: "record" }]);
    const listGrants = vi.fn(() => [
      { knowledgeId: "record", botId: "target", grantedAt: "2026-10-04" },
    ]);
    const bots = {
      get: () => ({ isDefault: false }),
      knowledge: { ledger: { list, listGrants } },
    } as unknown as BotProcessRegistry;
    const request = {
      method: "GET" as const,
      requestId: "metadata",
      path: "/bots/knowledge",
      headers: {},
    };
    const response = await handleBotApiRequest(bots, request);
    expect(JSON.parse(response?.body ?? "{}")).toEqual({
      knowledge: [{ id: "record" }],
      grants: [
        { knowledgeId: "record", botId: "target", grantedAt: "2026-10-04" },
      ],
    });
    expect(
      (await handleBotApiRequest(bots, { ...request, botId: "named" }))?.status,
    ).toBe(400);
    expect(list).toHaveBeenCalledOnce();
  });
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
        ledger: {
          get: () => ({
            id: "knowledge-1",
            title: "Finding",
            scope: { kind: "project", id: "project-1" },
          }),
        },
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
