import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { BotDefinition } from "@doolittle/contracts/bots";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendManager } from "./backend";
import { handleBotApiRequest } from "./bot-api";
import {
  BotProcessRegistry,
  type BotProcessRegistryOptions,
} from "./bot-process-registry";
import { BotTeamCatalog } from "./bot-team-catalog";

const teamDirectories: string[] = [];
afterEach(() => {
  for (const dir of teamDirectories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("activation API diagnostics", () => {
  function activationFixture(options: BotProcessRegistryOptions) {
    const directory = mkdtempSync(
      resolve(tmpdir(), "doolittle-activation-api-"),
    );
    teamDirectories.push(directory);
    const backend = {
      getState: () => ({ phase: "ready" }),
      getWorkspaceDirectory: () => directory,
      start: async () => ({ phase: "ready" }),
      stop: async () => undefined,
    } as unknown as BackendManager;
    return new BotProcessRegistry(
      { executable: "nub", args: [], repoRoot: directory },
      directory,
      backend,
      directory,
      { createBackend: () => backend, ...options },
    );
  }

  it.each(["grant", "backend"] as const)(
    "returns a bounded public diagnosis for a private %s failure",
    async (source) => {
      const privateDetail = `fixture-only-private-diagnostic:${"x".repeat(4000)}`;
      const fail = () => {
        throw new Error(privateDetail);
      };
      const registry = activationFixture({
        ...(source === "grant"
          ? { tokenResolver: async () => fail() }
          : { createBackend: fail }),
      });
      const bot = registry.create({
        name: "Private diagnostic",
        persona: "Keep startup diagnostics private.",
        model:
          source === "grant"
            ? { provider: "openai", model: "gpt-5.5" }
            : { provider: "offline", model: "offline" },
        permissions: {
          connectionIds: source === "grant" ? ["openai-api:account"] : [],
        },
      });
      const response = await handleBotApiRequest(registry, {
        requestId: "activation",
        method: "POST",
        path: `/bots/${bot.id}/activate`,
        headers: {},
      });
      expect(response?.status).toBe(409);
      expect(JSON.parse(response?.body ?? "{}")).toEqual({
        error: "This bot could not start. Check its connection and retry.",
        code: "bot_activation_failed",
      });
      expect(response?.body.length).toBeLessThan(180);
      expect(response?.body).not.toContain("fixture-only-private-diagnostic");
      expect(registry.summary(bot.id).state).toBe("error");
    },
  );

  it("returns typed cancellation rather than a failure after deliberate Stop", async () => {
    let resolveGrant!: (value: string | null) => void;
    const grant = new Promise<string | null>((resolvePromise) => {
      resolveGrant = resolvePromise;
    });
    const registry = activationFixture({ tokenResolver: () => grant });
    const bot = registry.create({
      name: "Cancelled startup",
      persona: "Stop means stop.",
      model: { provider: "openai", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-api:account"] },
    });
    const activation = handleBotApiRequest(registry, {
      requestId: "activation",
      method: "POST",
      path: `/bots/${bot.id}/activate`,
      headers: {},
    });
    await registry.stop(bot.id);
    resolveGrant(null);
    const response = await activation;
    expect(JSON.parse(response?.body ?? "{}")).toEqual({
      error: "Bot startup was cancelled.",
      code: "bot_activation_cancelled",
    });
    expect(registry.summary(bot.id).state).toBe("stopped");
  });
});

describe("conversation workspace grants", () => {
  function fixture() {
    const dir = mkdtempSync(resolve(tmpdir(), "doolittle-chat-grant-"));
    teamDirectories.push(dir);
    const root = resolve(dir, "project-root");
    mkdirSync(root);
    const backend = {
      getState: () => ({
        phase: "ready",
        url: "http://127.0.0.1:9",
        agentId: "00000000-0000-4000-8000-000000000003",
      }),
      getWorkspaceDirectory: () => dir,
      start: async () => ({ phase: "ready" }),
      stop: async () => undefined,
    } as unknown as BackendManager;
    let projectName = "Selected project";
    let instructions: string | undefined;
    let primaryPath = root;
    let oversized = false;
    const registry = new BotProcessRegistry(
      { executable: "nub", args: [], repoRoot: dir },
      dir,
      backend,
      dir,
      {
        createBackend: () => backend,
        runtimeFetch: vi.fn(async () =>
          Response.json({
            project: {
              id: "project-1",
              name: projectName,
              primaryPath,
              instructions,
              ...(oversized ? { padding: "x".repeat(30_000) } : {}),
            },
          }),
        ) as unknown as typeof fetch,
      },
    );
    const bot = registry.create({
      name: "Workspace bot",
      persona: "Work only in this chat's scope.",
      model: { provider: "offline", model: "offline" },
    });
    const post = (sessionId: string, projectId?: string) => ({
      requestId: `request-${sessionId}`,
      method: "POST" as const,
      path: `/bots/${bot.id}/conversations`,
      headers: {},
      body: JSON.stringify({
        sessionId,
        ...(projectId ? { projectId, consent: true } : {}),
      }),
    });
    return {
      dir,
      root,
      registry,
      bot,
      post,
      rename: (name: string) => {
        projectName = name;
      },
      setInstructions: (value: string) => {
        instructions = value;
      },
      setPrimaryPath: (value: string) => {
        primaryPath = value;
      },
      setOversized: () => {
        oversized = true;
      },
    };
  }

  it("starts a general chat in private scratch, not the current repository", async () => {
    const { registry, bot, dir, post } = fixture();
    const response = await handleBotApiRequest(registry, post("plain"));
    expect(response?.status).toBe(201);
    const root = JSON.parse(response?.body ?? "{}").conversation.workspacePath;
    expect(root).toBe(realpathSync(resolve(dir, "bot-workspaces", bot.id)));
    expect(root).not.toBe(dir);
    expect(
      registry.resolveConversationWorkspace(bot.id, "plain").workspacePath,
    ).toBe(root);
  });
  it("also keeps the lead's general chat outside the operator inventory repository", async () => {
    const { registry, dir } = fixture();
    const bot = registry.get("default");
    const response = await handleBotApiRequest(registry, {
      requestId: "lead-general",
      path: `/bots/${bot.id}/conversations`,
      method: "POST",
      headers: {},
      body: JSON.stringify({ sessionId: "lead-general" }),
    });
    expect(response?.status).toBe(201);
    const root = JSON.parse(response?.body ?? "{}").conversation.workspacePath;
    expect(root).toBe(realpathSync(resolve(dir, "bot-workspaces", bot.id)));
    expect(root).not.toBe(realpathSync(dir));
  });

  it("confirms exact project scope, rejects cancel and stale approval, and never rebinds", async () => {
    const { registry, bot, root, post, rename } = fixture();
    expect(
      (await handleBotApiRequest(registry, post("cancel", "project-1")))
        ?.status,
    ).toBe(403);
    expect(registry.resolveSavedConversationOwner("cancel")).toBeNull();
    const confirm = vi.fn(async () => true);
    const granted = await handleBotApiRequest(
      registry,
      post("project", "project-1"),
      confirm,
    );
    expect(granted?.status).toBe(201);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "conversation-workspace",
        detail: expect.stringContaining(realpathSync(root)),
      }),
    );
    expect(
      registry.resolveConversationWorkspace(bot.id, "project"),
    ).toMatchObject({
      workspacePath: realpathSync(root),
      projectId: "project-1",
      projectContext: { name: "Selected project" },
    });
    const existing = await handleBotApiRequest(registry, post("project"));
    expect(existing?.status).toBe(200);
    expect(JSON.parse(existing?.body ?? "{}").conversation.projectId).toBe(
      "project-1",
    );
    expect(
      (
        await handleBotApiRequest(
          registry,
          {
            ...post("project", "project-1"),
            body: JSON.stringify({
              sessionId: "project",
              projectId: "project-1",
            }),
          },
          confirm,
        )
      )?.status,
    ).toBe(200);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(
      (
        await handleBotApiRequest(
          registry,
          post("project", "other-project"),
          confirm,
        )
      )?.status,
    ).toBe(409);
    expect(
      (
        await handleBotApiRequest(
          registry,
          post("stale", "project-1"),
          async () => {
            rename("Renamed while confirming");
            return true;
          },
        )
      )?.status,
    ).toBe(409);
    expect(registry.resolveSavedConversationOwner("stale")).toBeNull();
  });

  it("does not infer a historical workspace during an idempotent lookup", async () => {
    const { registry, bot, post } = fixture();
    registry.conversations.bind(bot.id, "historical");
    expect(
      (await handleBotApiRequest(registry, post("historical")))?.status,
    ).toBe(409);
    expect(
      registry.conversations.get("historical")?.workspacePath,
    ).toBeUndefined();
  });
  it("rejects changed project instructions and same-tick capability changes during consent", async () => {
    const { registry, bot, post, setInstructions } = fixture();
    const stale = await handleBotApiRequest(
      registry,
      post("stale-context", "project-1"),
      async () => {
        setInstructions("Changed project instructions");
        return true;
      },
    );
    expect(stale?.status).toBe(409);
    expect(registry.resolveSavedConversationOwner("stale-context")).toBeNull();
    const get = registry.get.bind(registry);
    let changed = false;
    vi.spyOn(registry, "get").mockImplementation((id) => {
      const current = get(id);
      return changed && current.id === bot.id
        ? {
            ...current,
            permissions: {
              ...current.permissions,
              allowMutation: !current.permissions.allowMutation,
            },
          }
        : current;
    });
    expect(
      (
        await handleBotApiRequest(
          registry,
          post("stale-permissions", "project-1"),
          async () => {
            changed = true;
            return true;
          },
        )
      )?.status,
    ).toBe(409);
    expect(
      registry.resolveSavedConversationOwner("stale-permissions"),
    ).toBeNull();
  });
  it("bounds project response reads before asking for access", async () => {
    const { registry, post, setOversized } = fixture();
    setOversized();
    const confirm = vi.fn(async () => true);
    expect(
      (
        await handleBotApiRequest(
          registry,
          post("oversized", "project-1"),
          confirm,
        )
      )?.status,
    ).toBe(409);
    expect(confirm).not.toHaveBeenCalled();
  });
  it("never grants a file as a project workspace", async () => {
    const { registry, dir, post, setPrimaryPath } = fixture();
    const path = resolve(dir, "not-a-directory");
    writeFileSync(path, "not a project root");
    setPrimaryPath(path);
    const confirm = vi.fn(async () => true);
    expect(
      (
        await handleBotApiRequest(
          registry,
          post("file-root", "project-1"),
          confirm,
        )
      )?.status,
    ).toBe(409);
    expect(confirm).not.toHaveBeenCalled();
  });
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
