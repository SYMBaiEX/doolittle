import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendManager, BackendManagerOptions } from "./backend";
import { handleBotApiRequest } from "./bot-api";
import {
  BotActivationCancelledError,
  BotProcessRegistry,
} from "./bot-process-registry";
import { DesktopExecutionAdmission } from "./execution-admission";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(
  options: ConstructorParameters<typeof BotProcessRegistry>[4] = {},
) {
  const directory = mkdtempSync(resolve(tmpdir(), "doolittle-bot-registry-"));
  directories.push(directory);
  const captured: BackendManagerOptions[] = [];
  const backend = {
    getState: () => ({
      phase: "ready",
      url: "http://127.0.0.1:9",
      agentId: "9f21e797-127f-0eba-b547-92f9b113fb1e",
      name: "Doolittle",
    }),
    getWorkspaceDirectory: () => directory,
    start: async () => ({ phase: "ready" }),
    stop: async () => undefined,
    stopAllOwnedExecutions: vi.fn(async () => undefined),
  } as unknown as BackendManager;
  const registry = new BotProcessRegistry(
    { executable: "nub", args: [], repoRoot: directory },
    directory,
    backend,
    directory,
    {
      ...options,
      createBackend: (
        target,
        dataDir,
        workspace,
        runtimeFetch,
        workerOptions,
      ) => {
        captured.push(workerOptions);
        return (
          options.createBackend?.(
            target,
            dataDir,
            workspace,
            runtimeFetch,
            workerOptions,
          ) ?? backend
        );
      },
    },
  );
  return { registry, captured, directory, backend };
}

function jwt(accountId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      "https://api.openai.com/auth": { chatgpt_account_id: accountId },
    }),
  ).toString("base64url");
  return `header.${payload}.signature`;
}

describe("named bot native host grants", () => {
  it("binds only a live default scheduler room to a stable lead root", async () => {
    const jobId = "00000000-0000-4000-8000-000000000012";
    const runtimeFetch = vi.fn(async () =>
      Response.json({ jobs: [{ id: jobId, targetBotId: "default" }] }),
    ) as unknown as typeof fetch;
    const { registry } = fixture({ runtimeFetch });
    await registry.ensureDefaultAutomationConversation(`automation:${jobId}`);
    const first = registry.resolveConversationWorkspace(
      "default",
      `automation:${jobId}`,
    );
    expect(first.workspacePath).toBeTruthy();
    await registry.ensureDefaultAutomationConversation(`automation:${jobId}`);
    expect(
      registry.resolveConversationWorkspace("default", `automation:${jobId}`)
        .workspacePath,
    ).toBe(first.workspacePath);
    await expect(
      registry.ensureDefaultAutomationConversation(
        "automation:00000000-0000-4000-8000-000000000099",
      ),
    ).rejects.toThrow(/no live default scheduler job/);
  });
  it("expires a one-shot consulted chat scope on cancellation", async () => {
    const admission = new DesktopExecutionAdmission({ maxConcurrent: 2 });
    const { registry, captured } = fixture({ admission });
    const target = registry.create({
      name: "Reader",
      persona: "Answer once.",
      model: { provider: "offline", model: "offline" },
    });
    const origin = registry.bindConversationWorkspace("default", "origin-chat");
    const verified = await registry.resolveVerifiedConversationWorkspace(
      "default",
      "origin-chat",
    );
    const dispatchId = "00000000-0000-4000-8000-000000000011";
    registry.consultations.ledger.prepare({
      dispatchId,
      rootRunId: "origin-run",
      ancestry: [origin.botId],
      depth: 1,
      origin: {
        botId: origin.botId,
        agentId: registry.get("default").agentId,
        sessionId: "origin-chat",
        runId: "origin-run",
      },
      targetBotId: target.id,
      targetSessionId: `consult:${dispatchId}`,
      targetRunId: `consult:${dispatchId}`,
      workspacePath: verified.workspacePath,
      permissions: {
        ...target.permissions,
        workspacePaths: [verified.workspacePath],
      },
      deadline: new Date(Date.now() + 60_000).toISOString(),
      status: "prepared",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await registry.bindConsultationConversation(
      target.id,
      `consult:${dispatchId}`,
      verified,
    );
    registry.bindRun(
      target.id,
      `consult:${dispatchId}`,
      `consult:${dispatchId}`,
    );
    await expect(
      registry.resolveVerifiedConversationWorkspace(
        target.id,
        `consult:${dispatchId}`,
      ),
    ).resolves.toMatchObject({ workspacePath: verified.workspacePath });
    expect(() =>
      registry.forkConversationWorkspace(
        target.id,
        `consult:${dispatchId}`,
        "escaped-chat",
      ),
    ).toThrow(/transient execution scopes/i);
    await registry.activate(target.id);
    const handler = captured[0]?.workerHostHandler;
    const signal = new AbortController().signal;
    await expect(
      handler?.(
        {
          operation: "execution.claim",
          payload: {
            sessionId: `consult:${dispatchId}`,
            runId: "forged-run",
            kind: "foreground",
          },
        },
        signal,
      ),
    ).rejects.toThrow(/no active host-owned run binding/);
    expect(
      await handler?.(
        {
          operation: "execution.claim",
          payload: {
            sessionId: `consult:${dispatchId}`,
            runId: `consult:${dispatchId}`,
            kind: "foreground",
          },
        },
        signal,
      ),
    ).toMatchObject({ accepted: true });
    registry.consultations.ledger.update(dispatchId, "cancelled");
    await expect(
      registry.resolveVerifiedConversationWorkspace(
        target.id,
        `consult:${dispatchId}`,
      ),
    ).rejects.toThrow(/expired or was revoked/);
    expect(() =>
      registry.forkConversationWorkspace(
        "default",
        "automation:00000000-0000-4000-8000-000000000012",
        "escaped-job",
      ),
    ).toThrow(/transient execution scopes/i);
  });
  it("resolves two chat grants independently and admits mutations in separate roots", async () => {
    const admission = new DesktopExecutionAdmission({
      maxConcurrent: 2,
      maxPerBotActive: 2,
    });
    let roots: string[] = [];
    const runtimeFetch = vi.fn(async (url: string | URL | Request) => {
      const id = String(url).includes("project-1") ? 1 : 2;
      return Response.json({
        project: {
          id: `project-${id}`,
          name: `Project ${id}`,
          primaryPath: roots[id - 1],
        },
      });
    }) as unknown as typeof fetch;
    const { registry, captured, directory } = fixture({
      admission,
      runtimeFetch,
    });
    roots = [resolve(directory, "one"), resolve(directory, "two")];
    roots.forEach((root) => {
      mkdirSync(root);
    });
    const bot = registry.create({
      name: "Two projects",
      persona: "Respect the current chat's workspace.",
      model: { provider: "offline", model: "offline" },
      permissions: { allowMutation: true },
    });
    roots.forEach((root, index) => {
      registry.bindConversationWorkspace(bot.id, `session-${index + 1}`, {
        id: `project-${index + 1}`,
        name: `Project ${index + 1}`,
        workspacePath: realpathSync(root),
      });
    });
    await registry.activate(bot.id);
    const handler = captured[0]?.workerHostHandler;
    const signal = new AbortController().signal;
    const first = (await handler?.(
      { operation: "workspace.resolve", payload: { sessionId: "session-1" } },
      signal,
    )) as { workspacePath: string };
    const second = (await handler?.(
      { operation: "workspace.resolve", payload: { sessionId: "session-2" } },
      signal,
    )) as { workspacePath: string };
    expect(first.workspacePath).toBe(realpathSync(roots[0]));
    expect(second.workspacePath).toBe(realpathSync(roots[1]));
    registry.bindAcpSession(
      bot.id,
      "session-1",
      first.workspacePath,
      "acp:owned-by-one",
    );
    await expect(
      handler?.(
        {
          operation: "workspace.resolve",
          payload: { sessionId: "session-1", acpSessionId: "acp:owned-by-one" },
        },
        signal,
      ),
    ).resolves.toMatchObject({ workspacePath: first.workspacePath });
    await expect(
      handler?.(
        {
          operation: "workspace.resolve",
          payload: { sessionId: "session-2", acpSessionId: "acp:owned-by-one" },
        },
        signal,
      ),
    ).rejects.toThrow(/does not belong/i);
    const claim = async (sessionId: string, runId: string) =>
      handler?.(
        {
          operation: "execution.claim",
          payload: { sessionId, runId, kind: "foreground" },
        },
        signal,
      );
    expect(await claim("session-1", "run-1")).toMatchObject({ accepted: true });
    expect(await claim("session-2", "run-2")).toMatchObject({ accepted: true });
    expect(
      admission
        .list()
        .map((lease) => lease.mutationRoot)
        .sort(),
    ).toEqual(roots.map((root) => realpathSync(root)).sort());
    await expect(
      handler?.(
        { operation: "workspace.resolve", payload: { sessionId: "missing" } },
        signal,
      ),
    ).rejects.toThrow(/not bound/i);
  });
  it("requires a live same-chat parent for named automatic ACP admission", async () => {
    const admission = new DesktopExecutionAdmission({
      maxConcurrent: 2,
      maxPerBotActive: 2,
    });
    let roots: string[] = [];
    const runtimeFetch = vi.fn(async (url: string | URL | Request) => {
      const one = String(url).includes("project-one");
      return Response.json({
        project: {
          id: one ? "project-one" : "project-two",
          name: one ? "One" : "Two",
          primaryPath: roots[one ? 0 : 1],
        },
      });
    }) as unknown as typeof fetch;
    const { registry, captured, directory } = fixture({
      admission,
      runtimeFetch,
    });
    const rootOne = resolve(directory, "parent-one");
    const rootTwo = resolve(directory, "parent-two");
    mkdirSync(rootOne);
    mkdirSync(rootTwo);
    roots = [rootOne, rootTwo];
    const bot = registry.create({
      name: "Scoped ACP",
      persona: "Follow host grants.",
      model: { provider: "offline", model: "offline" },
      permissions: { allowMutation: true },
    });
    registry.bindConversationWorkspace(bot.id, "chat-one", {
      id: "project-one",
      name: "One",
      workspacePath: realpathSync(rootOne),
    });
    registry.bindConversationWorkspace(bot.id, "chat-two", {
      id: "project-two",
      name: "Two",
      workspacePath: realpathSync(rootTwo),
    });
    await registry.activate(bot.id);
    const handler = captured[0]?.workerHostHandler;
    if (!handler) throw new Error("Worker host fixture was not registered.");
    const signal = new AbortController().signal;
    const parentRunId = randomUUID();
    const child = (sessionId: string, parentRunId?: string) =>
      handler(
        {
          operation: "execution.claim",
          payload: {
            runId: `acp:${randomUUID()}`,
            sessionId,
            kind: "automatic-acp",
            parentRunId,
          },
        },
        signal,
      );
    await expect(child("chat-one")).rejects.toThrow(/matching foreground run/);
    const parent = (await handler(
      {
        operation: "execution.claim",
        payload: {
          runId: parentRunId,
          sessionId: "chat-one",
          kind: "foreground",
        },
      },
      signal,
    )) as { accepted: boolean; leaseId: string };
    expect(parent.accepted).toBe(true);
    await expect(child("chat-two", parentRunId)).rejects.toThrow(
      /matching foreground run/,
    );
    await expect(child("chat-one", randomUUID())).rejects.toThrow(
      /matching foreground run/,
    );
    await handler(
      {
        operation: "execution.release",
        payload: {
          runId: parentRunId,
          leaseId: parent.leaseId,
          yielding: true,
        },
      },
      signal,
    );
    const admitted = (await child("chat-one", parentRunId)) as {
      accepted: boolean;
      leaseId: string;
    };
    expect(admitted.accepted).toBe(true);
    await handler(
      {
        operation: "execution.release",
        payload: { runId: parentRunId, leaseId: parent.leaseId },
      },
      signal,
    );
    await expect(child("chat-one", parentRunId)).rejects.toThrow(
      /matching foreground run/,
    );
  });

  it("releases a queued named foreground claim if its workspace is revoked", async () => {
    const admission = new DesktopExecutionAdmission({
      maxConcurrent: 1,
      maxPerBotActive: 1,
    });
    let root = "";
    const runtimeFetch = vi.fn(async () =>
      Response.json({
        project: {
          id: "queued-project",
          name: "Queued",
          primaryPath: root,
        },
      }),
    ) as unknown as typeof fetch;
    const { registry, captured, directory } = fixture({
      admission,
      runtimeFetch,
    });
    root = resolve(directory, "queued-root");
    mkdirSync(root);
    const bot = registry.create({
      name: "Queued ACP",
      persona: "Follow host grants.",
      model: { provider: "offline", model: "offline" },
      permissions: { allowMutation: true },
    });
    registry.bindConversationWorkspace(bot.id, "queued-chat", {
      id: "queued-project",
      name: "Queued",
      workspacePath: realpathSync(root),
    });
    await registry.activate(bot.id);
    const blocker = admission.claim({
      botId: bot.id,
      runId: "blocker",
      sessionId: "other",
      kind: "foreground",
    });
    if (!blocker.accepted) throw new Error("Could not reserve the test seat.");
    const acquire = vi.spyOn(admission, "acquire");
    const handler = captured[0]?.workerHostHandler;
    if (!handler) throw new Error("Worker host fixture was not registered.");
    const queued = handler(
      {
        operation: "execution.claim",
        payload: {
          runId: randomUUID(),
          sessionId: "queued-chat",
          kind: "foreground",
        },
      },
      new AbortController().signal,
    );
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledOnce());
    rmSync(root, { recursive: true });
    admission.release({
      botId: bot.id,
      runId: "blocker",
      leaseId: blocker.leaseId,
    });
    await expect(queued).rejects.toThrow(
      /unavailable or changed|changed while awaiting/,
    );
    expect(admission.list()).toEqual([]);
  });

  it("does not edit access while a degraded worker may still be alive", async () => {
    const { registry } = fixture();
    const bot = registry.create({
      name: "Uncertain",
      persona: "Keep access fixed.",
      model: { provider: "offline", model: "offline" },
    });
    const backend = await registry.backendFor(bot.id);
    vi.spyOn(backend, "getState").mockReturnValue({
      phase: "degraded",
      message: "Unconfirmed stop",
    });
    Object.assign(backend, { hasLiveRuntime: () => true });
    await expect(registry.update(bot.id, { name: "Changed" })).rejects.toThrow(
      /Stop this bot/i,
    );
    Object.assign(backend, { hasLiveRuntime: () => false });
    await expect(
      registry.update(bot.id, { name: "Changed" }),
    ).resolves.toMatchObject({ name: "Changed" });
  });
  it("starts a saved bot on first use and coalesces simultaneous requests", async () => {
    const { registry, captured } = fixture();
    const bot = registry.create({
      name: "On demand",
      persona: "Wait until asked.",
      model: { provider: "offline", model: "offline" },
    });
    expect(captured).toHaveLength(0);
    const [one, two] = await Promise.all([
      registry.backendFor(bot.id),
      registry.backendFor(bot.id),
    ]);
    expect(one).toBe(two);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.isolatedEnvironment?.DOOLITTLE_BOT_PROFILE).toContain(
      bot.id,
    );
  });

  it("reports real pending grant checks without starting other saved bots", async () => {
    let resolveToken!: (value: string | null) => void;
    const token = new Promise<string | null>((resolvePromise) => {
      resolveToken = resolvePromise;
    });
    const tokenResolver = vi.fn(() => token);
    const { registry, captured } = fixture({ tokenResolver });
    const bot = registry.create({
      name: "New bot",
      persona: "Start only with approved access.",
      model: { provider: "openai", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-api:new-bot"] },
    });
    const unrelated = registry.create({
      name: "Unrelated",
      persona: "Stay stopped until explicitly asked.",
      model: { provider: "offline", model: "offline" },
    });
    const startup = registry.activate(bot.id);
    expect(registry.activate(bot.id)).toBe(startup);
    const firstUse = registry.backendFor(bot.id);
    expect(registry.summary(bot.id)).toMatchObject({ state: "starting" });
    expect(registry.summary(bot.id).error).toBeUndefined();
    expect(registry.summary(unrelated.id).state).toBe("stopped");
    expect(captured).toHaveLength(0);
    expect(tokenResolver).toHaveBeenCalledOnce();

    resolveToken("fixture-only-approved-key");
    await expect(startup).resolves.toMatchObject({ state: "ready" });
    await firstUse;
    expect(registry.summary(bot.id).error).toBeUndefined();
    expect(captured).toHaveLength(1);
    expect(registry.summary(unrelated.id).state).toBe("stopped");
  });

  it("inspects only an already-ready worker without starting a stopped bot", async () => {
    const { registry, captured } = fixture();
    const bot = registry.create({
      name: "Recovery",
      persona: "Keep stopped workers stopped.",
      model: { provider: "offline", model: "offline" },
    });
    expect(registry.readyBackendFor(bot.id)).toBeNull();
    expect(captured).toHaveLength(0);
    const ready = await registry.backendFor(bot.id);
    expect(registry.readyBackendFor(bot.id)).toBe(ready);
    await registry.stop(bot.id);
    expect(registry.readyBackendFor(bot.id)).toBeNull();
    expect(captured).toHaveLength(1);
  });

  it("reports an unavailable approved account and clears the failure on retry", async () => {
    const tokenResolver = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue("fixture-only-approved-key");
    const { registry, captured } = fixture({ tokenResolver });
    const bot = registry.create({
      name: "Unavailable",
      persona: "Only approved access.",
      model: { provider: "openai", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-api:unavailable"] },
    });
    await expect(registry.backendFor(bot.id)).rejects.toThrow(/unavailable/i);
    expect(captured).toHaveLength(0);
    expect(registry.summary(bot.id)).toMatchObject({
      state: "error",
      error: "This bot could not start. Check its connection and retry.",
    });
    await expect(registry.activate(bot.id)).resolves.toMatchObject({
      state: "ready",
    });
    expect(registry.summary(bot.id).error).toBeUndefined();
    expect(captured).toHaveLength(1);
  });

  it.each(["update", "stop"] as const)(
    "clears a failed pre-runtime activation on %s",
    async (operation) => {
      const { registry } = fixture({ tokenResolver: async () => null });
      const bot = registry.create({
        name: "Unavailable",
        persona: "Only approved access.",
        model: { provider: "openai", model: "gpt-5.5" },
        permissions: { connectionIds: ["openai-api:unavailable"] },
      });
      await expect(registry.activate(bot.id)).rejects.toThrow(/unavailable/i);
      expect(registry.summary(bot.id).state).toBe("error");
      if (operation === "update")
        await registry.update(bot.id, { name: "Updated" });
      else await registry.stop(bot.id);
      expect(registry.summary(bot.id).state).toBe("stopped");
      expect(registry.summary(bot.id).error).toBeUndefined();
    },
  );

  it("keeps raw grant failures out of the catalog", async () => {
    const { registry } = fixture({
      tokenResolver: async () => {
        throw new Error("fixture-only-sensitive-grant-detail");
      },
    });
    const bot = registry.create({
      name: "Private failure",
      persona: "Do not expose credential diagnostics in summaries.",
      model: { provider: "openai", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-api:unavailable"] },
    });
    await expect(registry.activate(bot.id)).rejects.toThrow(
      "fixture-only-sensitive-grant-detail",
    );
    expect(registry.summary(bot.id).state).toBe("error");
    expect(JSON.stringify(registry.list())).not.toContain(
      "fixture-only-sensitive-grant-detail",
    );
  });

  it("cancels a delayed startup before any worker is created", async () => {
    let resolveToken!: (value: string | null) => void;
    const token = new Promise<string | null>((resolvePromise) => {
      resolveToken = resolvePromise;
    });
    const { registry, captured } = fixture({ tokenResolver: () => token });
    const bot = registry.create({
      name: "Delayed",
      persona: "Stop means stop.",
      model: { provider: "openai", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-api:delayed"] },
    });
    const startup = registry.activate(bot.id);
    const rejected = expect(startup).rejects.toThrow(/cancelled/i);
    expect(registry.summary(bot.id).state).toBe("starting");
    await registry.stop(bot.id);
    expect(registry.summary(bot.id).state).toBe("stopped");
    resolveToken("fixture-only-approved-key");
    await rejected;
    expect(captured).toHaveLength(0);
    expect(registry.summary(bot.id).state).toBe("stopped");
    expect(registry.summary(bot.id).error).toBeUndefined();
  });

  it("does not turn a stopped pending activation into a grant error", async () => {
    let resolveToken!: (value: string | null) => void;
    const token = new Promise<string | null>((resolvePromise) => {
      resolveToken = resolvePromise;
    });
    const { registry, captured } = fixture({ tokenResolver: () => token });
    const bot = registry.create({
      name: "Stopped grant",
      persona: "Stop cancels pending access checks.",
      model: { provider: "openai", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-api:delayed"] },
    });
    const startup = registry.activate(bot.id);
    const rejected = expect(startup).rejects.toBeInstanceOf(
      BotActivationCancelledError,
    );
    await registry.stop(bot.id);
    resolveToken(null);
    await rejected;
    expect(registry.summary(bot.id).state).toBe("stopped");
    expect(registry.summary(bot.id).error).toBeUndefined();
    expect(captured).toHaveLength(0);
  });

  it("allows immediate Start after Stop without reusing or poisoning an old grant", async () => {
    let resolveOld!: (value: string | null) => void;
    let resolveNew!: (value: string | null) => void;
    const oldGrant = new Promise<string | null>((resolvePromise) => {
      resolveOld = resolvePromise;
    });
    const newGrant = new Promise<string | null>((resolvePromise) => {
      resolveNew = resolvePromise;
    });
    const tokenResolver = vi
      .fn()
      .mockReturnValueOnce(oldGrant)
      .mockReturnValueOnce(newGrant);
    const { registry, captured } = fixture({ tokenResolver });
    const bot = registry.create({
      name: "Restarted grant",
      persona: "Use the latest explicit start intent.",
      model: { provider: "openai", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-api:delayed"] },
    });
    const oldStartup = registry.activate(bot.id);
    const oldRejected = expect(oldStartup).rejects.toBeInstanceOf(
      BotActivationCancelledError,
    );
    await registry.stop(bot.id);
    const newStartup = registry.activate(bot.id);
    expect(newStartup).not.toBe(oldStartup);
    expect(tokenResolver).toHaveBeenCalledTimes(2);
    expect(registry.summary(bot.id).state).toBe("starting");

    resolveOld(null);
    await oldRejected;
    expect(registry.activate(bot.id)).toBe(newStartup);
    expect(registry.summary(bot.id).state).toBe("starting");
    resolveNew("fixture-only-approved-key");
    await expect(newStartup).resolves.toMatchObject({ state: "ready" });
    expect(captured).toHaveLength(1);
    expect(registry.summary(bot.id).error).toBeUndefined();
  });

  it("starts from an edited configuration without waiting for its stale grant", async () => {
    let finishOld!: (value: string | null) => void;
    const oldGrant = new Promise<string | null>((resolvePromise) => {
      finishOld = resolvePromise;
    });
    const tokenResolver = vi
      .fn()
      .mockReturnValueOnce(oldGrant)
      .mockResolvedValue("fixture-only-approved-key");
    const { registry, captured } = fixture({ tokenResolver });
    const bot = registry.create({
      name: "Edit during grant",
      persona: "The edit wins.",
      model: { provider: "openai", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-api:delayed"] },
    });
    const stale = registry.activate(bot.id);
    const cancelled = expect(stale).rejects.toBeInstanceOf(
      BotActivationCancelledError,
    );
    await registry.update(bot.id, { name: "Edited" });
    const fresh = registry.activate(bot.id);
    expect(fresh).not.toBe(stale);
    await expect(fresh).resolves.toMatchObject({
      name: "Edited",
      state: "ready",
    });
    finishOld("fixture-only-approved-key");
    await cancelled;
    expect(captured).toHaveLength(1);
  });

  it("waits for backend teardown and ignores the old late startup result", async () => {
    let finishOldStart!: (value: { phase: "ready" }) => void;
    let finishOldStop!: () => void;
    const oldStart = new Promise<{ phase: "ready" }>((resolvePromise) => {
      finishOldStart = resolvePromise;
    });
    const oldStop = new Promise<void>((resolvePromise) => {
      finishOldStop = resolvePromise;
    });
    const oldBackend = {
      getState: () => ({ phase: "booting" }),
      start: () => oldStart,
      stop: vi.fn(() => oldStop),
    } as unknown as BackendManager;
    const newBackend = {
      getState: () => ({ phase: "ready" }),
      start: async () => ({ phase: "ready" }),
      stop: vi.fn(async () => undefined),
    } as unknown as BackendManager;
    const createBackend = vi
      .fn()
      .mockReturnValueOnce(oldBackend)
      .mockReturnValue(newBackend);
    const { registry, captured } = fixture({ createBackend });
    const bot = registry.create({
      name: "Restarted backend",
      persona: "Never overlap generations.",
      model: { provider: "offline", model: "offline" },
    });
    const oldStartup = registry.activate(bot.id);
    const oldRejected = expect(oldStartup).rejects.toBeInstanceOf(
      BotActivationCancelledError,
    );
    await vi.waitFor(() => expect(captured).toHaveLength(1));
    const stopped = registry.stop(bot.id);
    await vi.waitFor(() => expect(oldBackend.stop).toHaveBeenCalledOnce());
    const restart = registry.activate(bot.id);
    expect(captured).toHaveLength(1);
    finishOldStop();
    await stopped;
    await expect(restart).resolves.toMatchObject({ state: "ready" });
    expect(captured).toHaveLength(2);

    finishOldStart({ phase: "ready" });
    await oldRejected;
    expect(oldBackend.stop).toHaveBeenCalledOnce();
    expect(newBackend.stop).not.toHaveBeenCalled();
    expect(registry.summary(bot.id).state).toBe("ready");
    expect(await registry.backendFor(bot.id)).toBe(newBackend);
  });

  it("lets a second Stop cancel a Start queued behind the first teardown", async () => {
    let finishStop!: () => void;
    const stopGate = new Promise<void>((resolvePromise) => {
      finishStop = resolvePromise;
    });
    const backend = {
      getState: () => ({ phase: "ready" }),
      start: async () => ({ phase: "ready" }),
      stop: vi.fn(() => stopGate),
    } as unknown as BackendManager;
    const { registry, captured } = fixture({ createBackend: () => backend });
    const bot = registry.create({
      name: "Latest stop wins",
      persona: "Never revive an older queued start.",
      model: { provider: "offline", model: "offline" },
    });
    await registry.activate(bot.id);
    const firstStop = registry.stop(bot.id);
    await vi.waitFor(() => expect(backend.stop).toHaveBeenCalledOnce());
    const queuedStart = registry.activate(bot.id);
    const cancelled = expect(queuedStart).rejects.toBeInstanceOf(
      BotActivationCancelledError,
    );
    const secondStop = registry.stop(bot.id);
    finishStop();
    await Promise.all([firstStop, secondStop]);
    await cancelled;
    expect(captured).toHaveLength(1);
    expect(backend.stop).toHaveBeenCalledOnce();
    expect(registry.summary(bot.id).state).toBe("stopped");
  });

  it.each(["stopAll", "stopAllOwnedExecutions"] as const)(
    "%s releases stale pending grants without poisoning a later explicit start",
    async (action) => {
      let resolveOld!: (value: string | null) => void;
      let resolveNew!: (value: string | null) => void;
      const oldGrant = new Promise<string | null>((resolvePromise) => {
        resolveOld = resolvePromise;
      });
      const newGrant = new Promise<string | null>((resolvePromise) => {
        resolveNew = resolvePromise;
      });
      const { registry, captured } = fixture({
        tokenResolver: vi
          .fn()
          .mockReturnValueOnce(oldGrant)
          .mockReturnValueOnce(newGrant),
      });
      const bot = registry.create({
        name: "Global stop recovery",
        persona: "Only the latest explicit start may proceed.",
        model: { provider: "openai", model: "gpt-5.5" },
        permissions: { connectionIds: ["openai-api:delayed"] },
      });
      const oldStartup = registry.activate(bot.id);
      const cancelled = expect(oldStartup).rejects.toBeInstanceOf(
        BotActivationCancelledError,
      );
      await registry[action]();
      const newStartup = registry.activate(bot.id);
      expect(newStartup).not.toBe(oldStartup);
      resolveOld(null);
      await cancelled;
      expect(registry.activate(bot.id)).toBe(newStartup);
      expect(registry.summary(bot.id).state).toBe("starting");
      resolveNew("fixture-only-approved-key");
      await expect(newStartup).resolves.toMatchObject({ state: "ready" });
      expect(captured).toHaveLength(1);
    },
  );

  it.each(["stopAll", "stopAllOwnedExecutions"] as const)(
    "%s gates queued starts and a repeated global stop cancels old intent",
    async (action) => {
      let finishBookkeeping!: () => void;
      const bookkeeping = new Promise<void>((resolvePromise) => {
        finishBookkeeping = resolvePromise;
      });
      const { registry, captured, backend } = fixture();
      const bot = registry.create({
        name: "Global stop race",
        persona: "Wait until the global action completes.",
        model: { provider: "offline", model: "offline" },
      });
      await registry.activate(bot.id);
      const runtimeStop = vi.spyOn(backend, "stop");
      vi.spyOn(registry.automations, "cancelAll").mockReturnValue(bookkeeping);
      const firstStop = registry[action]();
      const queuedStart = registry.activate(bot.id);
      const cancelled = expect(queuedStart).rejects.toBeInstanceOf(
        BotActivationCancelledError,
      );
      const secondStop = registry[action]();
      expect(captured).toHaveLength(1);
      finishBookkeeping();
      await Promise.all([firstStop, secondStop]);
      await cancelled;
      expect(captured).toHaveLength(1);
      expect(registry.summary(bot.id).state).toBe(
        action === "stopAll" ? "stopped" : "ready",
      );
      if (action === "stopAllOwnedExecutions")
        expect(runtimeStop).not.toHaveBeenCalled();
    },
  );

  it("keeps archived bots archived when pending startup settles", async () => {
    let resolveToken!: (value: string | null) => void;
    const token = new Promise<string | null>((resolvePromise) => {
      resolveToken = resolvePromise;
    });
    const { registry, captured } = fixture({ tokenResolver: () => token });
    const bot = registry.create({
      name: "Archived grant",
      persona: "Archive must never start a bot.",
      model: { provider: "openai", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-api:delayed"] },
    });
    const startup = registry.activate(bot.id);
    const rejected = expect(startup).rejects.toThrow(/cancelled/i);
    await expect(registry.archive(bot.id)).resolves.toMatchObject({
      state: "archived",
    });
    resolveToken("fixture-only-approved-key");
    await rejected;
    expect(registry.summary(bot.id).state).toBe("archived");
    expect(captured).toHaveLength(0);
    expect(() => registry.activate(bot.id)).toThrow(/archived/i);
  });

  it("does not revive a Start queued behind teardown when Archive wins", async () => {
    let finishStop!: () => void;
    const stopGate = new Promise<void>((resolvePromise) => {
      finishStop = resolvePromise;
    });
    const worker = {
      getState: () => ({ phase: "ready" }),
      start: async () => ({ phase: "ready" }),
      stop: vi.fn(() => stopGate),
    } as unknown as BackendManager;
    const { registry, captured } = fixture({ createBackend: () => worker });
    const bot = registry.create({
      name: "Archive race",
      persona: "Archive wins.",
      model: { provider: "offline", model: "offline" },
    });
    await registry.activate(bot.id);
    const stop = registry.stop(bot.id);
    await vi.waitFor(() => expect(worker.stop).toHaveBeenCalledOnce());
    const queued = registry.activate(bot.id);
    const cancelled = expect(queued).rejects.toBeInstanceOf(
      BotActivationCancelledError,
    );
    const archive = registry.archive(bot.id);
    finishStop();
    await Promise.all([stop, archive, cancelled]);
    expect(registry.summary(bot.id).state).toBe("archived");
    expect(captured).toHaveLength(1);
  });

  it("refreshes only the selected Codex account on every host call", async () => {
    const tokenResolver = vi.fn(async () => jwt("chatgpt-account-1"));
    const { registry, captured } = fixture({ tokenResolver });
    const bot = registry.create({
      name: "Code",
      persona: "Code carefully.",
      model: { provider: "codex", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-codex:account-one"] },
    });
    await registry.activate(bot.id);
    expect(captured[0]?.isolatedEnvironment?.OPENAI_API_KEY).toBeUndefined();
    expect(captured[0]?.isolatedEnvironment?.DOOLITTLE_BOT_PROFILE).toContain(
      bot.id,
    );
    const handler = captured[0]?.workerHostHandler;
    expect(handler).toBeDefined();
    expect(
      await handler?.(
        { operation: "codex.auth", payload: null },
        new AbortController().signal,
      ),
    ).toEqual({
      accessToken: jwt("chatgpt-account-1"),
      accountId: "chatgpt-account-1",
    });
    expect(tokenResolver).toHaveBeenCalledWith("openai-codex", "account-one");
    expect(tokenResolver).toHaveBeenCalledTimes(2);
    await expect(
      handler?.(
        { operation: "claude.invoke", payload: {} },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/not approved/i);
  });

  it("fails closed if a Codex token lacks an account id", async () => {
    const { registry } = fixture({ tokenResolver: async () => "bad-token" });
    const bot = registry.create({
      name: "Code",
      persona: "Code carefully.",
      model: { provider: "codex", model: "gpt-5.5" },
      permissions: { connectionIds: ["openai-codex:account-one"] },
    });
    await expect(registry.activate(bot.id)).rejects.toThrow(
      /Codex account is unavailable/i,
    );
  });

  it("binds Claude CLI calls to a real synthetic CLI account and configured model", async () => {
    const invokeClaudeCli = vi.fn(async () => "approved reply");
    const { registry, captured } = fixture({
      invokeClaudeCli,
      subscriptionStatus: () => [
        {
          provider: "anthropic-subscription",
          accountId: "claude-code-cli",
          label: "Claude Code CLI",
          configured: true,
          valid: true,
          expiresAt: null,
          source: "claude-code-cli",
        },
      ],
    });
    const bot = registry.create({
      name: "Writer",
      persona: "Write clearly.",
      model: { provider: "claude-code", model: "claude-sonnet-4.6" },
      permissions: {
        connectionIds: ["anthropic-subscription:claude-code-cli"],
      },
    });
    await registry.activate(bot.id);
    registry.bindConversation(bot.id, "claude-session");
    const handler = captured[0]?.workerHostHandler;
    await expect(
      handler?.(
        {
          operation: "claude.invoke",
          payload: { prompt: "Hello", model: "opus" },
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/Invalid Claude request/i);
    expect(
      await handler?.(
        {
          operation: "claude.invoke",
          payload: {
            prompt: "Hello",
            model: "sonnet",
            sessionId: "claude-session",
          },
        },
        new AbortController().signal,
      ),
    ).toBe("approved reply");
    expect(invokeClaudeCli).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Hello", model: "sonnet" }),
    );
  });
});

describe("global run ownership", () => {
  it("polls a 50-bot fleet in bounded parallel batches and coalesces callers", async () => {
    let active = 0;
    let peak = 0;
    const runtimeFetch = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1));
      active--;
      return Response.json({ runs: [] });
    }) as unknown as typeof fetch;
    const { registry } = fixture({ runtimeFetch });
    for (let index = 0; index < 49; index++) {
      const bot = registry.create({
        name: `Fleet ${index}`,
        persona: "Isolated offline fixture.",
        model: { provider: "offline", model: "offline" },
      });
      await registry.activate(bot.id);
    }
    const first = registry.refreshActiveRuns();
    const second = registry.refreshActiveRuns();
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(runtimeFetch).toHaveBeenCalledTimes(50);
    expect(peak).toBe(8);
    expect(active).toBe(0);
  });

  it("derives active counts from runtime receipts, not attached observers", async () => {
    let status = "thinking";
    const runtimeFetch = vi.fn(async () =>
      Response.json({
        runs: [{ runId: "run-1", status }],
      }),
    ) as unknown as typeof fetch;
    const { registry } = fixture({ runtimeFetch });
    registry.beginRun("default", "observer-only");
    await registry.refreshActiveRuns();
    expect(registry.list().bots[0]).toMatchObject({
      activeRunCount: 1,
      state: "busy",
    });
    registry.endRun("default", "run-1");
    await registry.refreshActiveRuns();
    expect(registry.list().bots[0]?.activeRunCount).toBe(1);
    status = "complete";
    await registry.refreshActiveRuns();
    expect(registry.list().bots[0]).toMatchObject({
      activeRunCount: 0,
      state: "ready",
    });
  });

  it("does not return a falsely idle catalog when receipt reconciliation fails", async () => {
    const { registry } = fixture({
      runtimeFetch: vi.fn(async () => {
        throw new Error("runtime disconnected");
      }) as unknown as typeof fetch,
    });
    const response = await handleBotApiRequest(registry, {
      requestId: "request-1",
      path: "/bots",
      method: "GET",
      headers: {},
    });
    expect(response?.status).toBe(503);
    expect(JSON.parse(response?.body ?? "null").code).toBe(
      "bot_status_unavailable",
    );
  });

  it("rejects a duplicate run id under a different bot even with separate workers", () => {
    const { registry } = fixture();
    const one = registry.create({
      name: "One",
      persona: "First.",
      model: { provider: "offline", model: "offline" },
    });
    const two = registry.create({
      name: "Two",
      persona: "Second.",
      model: { provider: "offline", model: "offline" },
    });
    registry.bindConversation(one.id, "session-1");
    registry.bindConversation(two.id, "session-2");
    registry.bindRun(one.id, "session-1", "run-1");
    expect(() => registry.bindRun(two.id, "session-2", "run-1")).toThrow(
      /different bot|different.*conversation/i,
    );
    expect(registry.conversations.getRun("run-1")).toMatchObject({
      botId: one.id,
      sessionId: "session-1",
    });
  });

  it("adopts a legacy lead run only from its canonical receipt and session summary", async () => {
    const runtimeFetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/sessions/summary")
        ? Response.json({
            summary: {
              sessionId: "legacy-session",
              projectId: "project-1",
              messageCount: 2,
            },
          })
        : Response.json({
            run: { runId: "legacy-run", sessionId: "legacy-session" },
          }),
    ) as unknown as typeof fetch;
    const { registry } = fixture({ runtimeFetch });
    await registry.assertRunOwner("default", "legacy-run");
    expect(registry.conversations.getRun("legacy-run")).toMatchObject({
      botId: "9f21e797-127f-0eba-b547-92f9b113fb1e",
      sessionId: "legacy-session",
      projectId: "project-1",
    });
    expect(runtimeFetch).toHaveBeenCalledTimes(2);
    await registry.assertRunOwner("default", "legacy-run");
    expect(runtimeFetch).toHaveBeenCalledTimes(2);
  });

  it("refuses a legacy run when the receipt does not match the requested id", async () => {
    const runtimeFetch = vi.fn(async () =>
      Response.json({
        run: { runId: "other-run", sessionId: "legacy-session" },
      }),
    ) as unknown as typeof fetch;
    const { registry } = fixture({ runtimeFetch });
    await expect(
      registry.assertRunOwner("default", "legacy-run"),
    ).rejects.toThrow(/receipt is invalid/i);
    expect(registry.conversations.getRun("legacy-run")).toBeNull();
  });
});
