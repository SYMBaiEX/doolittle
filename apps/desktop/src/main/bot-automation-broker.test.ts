import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { AutomationJobRecord } from "@doolittle/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendManager, BackendManagerOptions } from "./backend";
import { BotAutomationLedger } from "./bot-automation-ledger";
import { BotProcessRegistry } from "./bot-process-registry";
import { DesktopExecutionAdmission } from "./execution-admission";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), "doolittle-automation-"));
  directories.push(directory);
  const jobs: AutomationJobRecord[] = [];
  const posts: Record<string, string>[] = [];
  const cancels: string[] = [];
  let beforeCatalog: (() => Promise<void>) | undefined;
  let beforePost: (() => Promise<void>) | undefined;
  let beforeTranscript: (() => Promise<void>) | undefined;
  let uncertain = false;
  let messages = [{ role: "assistant", text: "exact automation result" }];
  const backend = (url: string) =>
    ({
      getState: () => ({
        phase: "ready",
        url,
        agentId: randomUUID(),
        name: "fixture",
      }),
      getWorkspaceDirectory: () => directory,
      start: vi.fn(async () => ({ phase: "ready" })),
      stop: vi.fn(async () => undefined),
      stopAllOwnedExecutions: vi.fn(async () => undefined),
    }) as unknown as BackendManager;
  const lead = backend("http://lead.invalid");
  const worker = backend("http://target.invalid");
  const captured: BackendManagerOptions[] = [];
  const admission = new DesktopExecutionAdmission();
  const runtimeFetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "http://lead.invalid/cron/jobs") {
        await beforeCatalog?.();
        return Response.json({ jobs });
      }
      if (url.endsWith("/cancel")) {
        cancels.push(url);
        return Response.json({ ok: true });
      }
      if (url.endsWith("/chat/runs") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        await beforePost?.();
        if (uncertain) throw new Error("uncertain transport acknowledgement");
        return Response.json(
          { run_id: body.runId, room_id: body.roomId },
          { status: 202 },
        );
      }
      const fire = registry.automations.ledger.list().at(-1);
      if (url.includes("/sessions/messages?")) {
        await beforeTranscript?.();
        return Response.json({ throughRunId: fire?.runId, messages });
      }
      if (url.includes("/chat/runs/"))
        return Response.json({
          run: {
            runId: fire?.runId,
            sessionId: fire?.sessionId,
            status: "complete",
          },
        });
      throw new Error(`Unexpected fixture request ${url}`);
    },
  ) as unknown as typeof fetch;
  const consent = vi.fn(async () => true);
  const registry = new BotProcessRegistry(
    { executable: "nub", args: [], repoRoot: directory },
    directory,
    lead,
    directory,
    {
      runtimeFetch,
      admission,
      confirmAutomation: consent,
      createBackend: (_target, _data, _workspace, _fetch, options) => {
        captured.push(options);
        return worker;
      },
    },
  );
  const bot = registry.create({
    name: "Scout",
    persona: "Read carefully.",
    model: { provider: "offline", model: "offline" },
    permissions: { workspacePaths: [directory] },
  });
  const now = new Date().toISOString();
  const job: AutomationJobRecord = {
    id: randomUUID(),
    targetBotId: bot.id,
    name: "Workspace report",
    prompt: "Summarize evidence.",
    schedule: "every 1h",
    skills: [],
    delivery: "local",
    status: "active",
    oneShot: false,
    createdAt: now,
    updatedAt: now,
    trigger: { type: "schedule", schedule: "every 1h" },
    action: { type: "run-agent", prompt: "Summarize evidence." },
  };
  const approve = async () => {
    const receipt = await registry.automations.validate("default", job);
    job.targetApprovalId = receipt.approvalId;
    jobs.push(job);
  };
  const dispatch = (key = "sdk-fire-1", signal?: AbortSignal) =>
    registry.automations.dispatch(
      "default",
      { jobId: job.id, idempotencyKey: key, source: "schedule" },
      signal,
    );
  return {
    registry,
    bot,
    job,
    jobs,
    posts,
    cancels,
    captured,
    admission,
    lead,
    worker,
    consent,
    directory,
    approve,
    dispatch,
    setCatalog: (fn?: () => Promise<void>) => {
      beforeCatalog = fn;
    },
    setPost: (fn?: () => Promise<void>) => {
      beforePost = fn;
    },
    setTranscript: (fn?: () => Promise<void>) => {
      beforeTranscript = fn;
    },
    setUncertain: () => {
      uncertain = true;
    },
    setMessages: (value: typeof messages) => {
      messages = value;
    },
  };
}

describe("application-owned named automation", () => {
  it("honors the two-slot automatic limit through the actual named worker host handler", async () => {
    const f = fixture();
    await f.approve();
    const fires = await Promise.all([
      f.dispatch("key-1"),
      f.dispatch("key-2"),
      f.dispatch("key-3"),
    ]);
    const handler = f.captured[0].workerHostHandler;
    const results = await Promise.all(
      fires.map((fire) =>
        handler?.(
          {
            operation: "execution.claim",
            payload: {
              runId: fire.runId,
              sessionId: fire.sessionId,
              kind: "foreground",
            },
          },
          new AbortController().signal,
        ),
      ),
    );
    expect(
      results.filter((row) => (row as { accepted?: boolean }).accepted),
    ).toHaveLength(2);
    expect(results).toContainEqual({
      accepted: false,
      reason: "automatic_acp_limit",
    });
    expect(
      f.admission.list().every((row) => row.kind === "automatic-acp"),
    ).toBe(true);
    await expect(
      handler?.(
        { operation: "automation.validate", payload: { job: f.job } },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
  it("still stops every actual backend when automation bookkeeping needs recovery", async () => {
    const f = fixture();
    await f.approve();
    await f.dispatch();
    const ledger = f.registry.automations.ledger as unknown as {
      failed: boolean;
    };
    ledger.failed = true;
    await expect(f.registry.stopAllOwnedExecutions()).rejects.toThrow(
      /requires recovery/,
    );
    expect(f.lead.stopAllOwnedExecutions).toHaveBeenCalledOnce();
    expect(f.worker.stopAllOwnedExecutions).toHaveBeenCalledOnce();
  });
  it("blocks pending activation and later POST after abort", async () => {
    const f = fixture();
    await f.approve();
    const entered = deferred();
    const blocked = deferred();
    const original = f.registry.activate.bind(f.registry);
    vi.spyOn(f.registry, "activate").mockImplementation(async (id) => {
      entered.release();
      await blocked.promise;
      return original(id);
    });
    const controller = new AbortController();
    const pending = f.dispatch("abort-activation", controller.signal);
    await entered.promise;
    controller.abort();
    blocked.release();
    await expect(pending).rejects.toThrow();
    expect(f.posts).toHaveLength(0);
    expect(f.registry.automations.ledger.list()[0].status).toBe("cancelled");
  });
  it("checks archived targets and revoked grants after async activation", async () => {
    const f = fixture();
    await f.approve();
    vi.spyOn(f.registry, "validateAutomationConnection").mockImplementation(
      async () => {
        throw new Error("Approved model account was revoked.");
      },
    );
    await expect(f.dispatch("revoked")).rejects.toThrow(/revoked/);
    expect(f.posts).toHaveLength(0);
    vi.restoreAllMocks();
    f.registry.catalog.archive(f.bot.id);
    await expect(f.dispatch("archived")).rejects.toThrow(/archived/);
    expect(f.posts).toHaveLength(0);
  });
  it("approves canonical target, persists before POST, and returns its exact independent result", async () => {
    const f = fixture();
    await f.approve();
    f.setPost(async () => {
      expect(f.registry.automations.ledger.list()[0]).toMatchObject({
        status: "prepared",
        targetBotId: f.bot.id,
      });
      expect(f.registry.conversations.getRun(f.posts[0].runId)?.botId).toBe(
        f.bot.id,
      );
    });
    const fire = await f.dispatch();
    expect(fire.status).toBe("accepted");
    expect(
      f.registry.automations.status("default", {
        jobId: f.job.id,
        idempotencyKey: "sdk-fire-1",
      }),
    ).toEqual({ status: "accepted" });
    expect(() =>
      f.registry.automations.status(f.bot.id, {
        jobId: f.job.id,
        idempotencyKey: "sdk-fire-1",
      }),
    ).toThrow(/default scheduler/);
    expect(f.posts[0]).toMatchObject({
      source: "desktop-automation",
      message: f.job.prompt,
      roomId: fire.sessionId,
      runId: fire.runId,
    });
    expect(f.consent.mock.calls[0][0]).toMatchObject({
      message: expect.stringContaining("Scout"),
    });
    expect(await f.registry.automations.wait("default", fire.fireId)).toEqual({
      text: "exact automation result",
    });
    expect(f.registry.automations.ledger.get(fire.fireId)?.status).toBe(
      "complete",
    );
  });
  it("never replays an uncertain acknowledgement, including after restart", async () => {
    const f = fixture();
    await f.approve();
    f.setUncertain();
    const fire = await f.dispatch();
    expect(fire.status).toBe("prepared");
    expect(await f.dispatch()).toEqual(fire);
    expect(f.posts).toHaveLength(1);
    const restored = new BotAutomationLedger(f.directory);
    expect(restored.forKey(f.job.id, fire.fireKeyDigest)).toEqual(fire);
    const ledgerPath = resolve(
      f.directory,
      "bots",
      "automation-dispatches.json",
    );
    const raw = readFileSync(ledgerPath, "utf8");
    expect(raw).not.toContain(f.job.prompt);
    expect(raw).not.toContain("sdk-fire-1");
    expect(statSync(ledgerPath).mode & 0o777).toBe(0o600);
  });
  it.each(["all", "bot"])(
    "rejects %s stop while the initial catalog read is pending",
    async (scope) => {
      const f = fixture();
      await f.approve();
      const entered = deferred();
      const blocked = deferred();
      f.setCatalog(async () => {
        entered.release();
        await blocked.promise;
      });
      const pending = f.dispatch();
      await entered.promise;
      if (scope === "all") await f.registry.automations.cancelAll();
      else await f.registry.automations.cancelForBot(f.bot.id);
      blocked.release();
      await expect(pending).rejects.toThrow(/cancelled/);
      expect(f.posts).toHaveLength(0);
      expect(f.captured).toHaveLength(0);
      expect(f.registry.automations.ledger.list()).toHaveLength(0);
    },
  );
  it.each(["paused", "removed", "changed"])(
    "re-reads the authoritative job after late activation: %s",
    async (change) => {
      const f = fixture();
      await f.approve();
      const original = f.registry.backendFor.bind(f.registry);
      vi.spyOn(f.registry, "backendFor").mockImplementation(async (id) => {
        const backend = await original(id);
        if (id === f.bot.id) {
          if (change === "paused") f.job.status = "paused";
          if (change === "removed") f.jobs.splice(0);
          if (change === "changed") f.job.prompt = "Changed after approval";
        }
        return backend;
      });
      await expect(f.dispatch()).rejects.toThrow(
        /paused|removed|authorization|unsupported/i,
      );
      expect(f.posts).toHaveLength(0);
    },
  );
  it("cancels the actual run again after a late submission acknowledgement", async () => {
    const f = fixture();
    await f.approve();
    const entered = deferred();
    const blocked = deferred();
    f.setPost(async () => {
      entered.release();
      await blocked.promise;
    });
    const pending = f.dispatch();
    await entered.promise;
    await f.registry.automations.cancelAll();
    expect(f.cancels).toHaveLength(1);
    blocked.release();
    const fire = await pending;
    expect(fire.status).toBe("cancelled");
    expect(f.cancels).toHaveLength(2);
    await expect(
      f.registry.automations.wait("default", fire.fireId),
    ).rejects.toThrow(/without an authorized result/);
    expect(await f.dispatch()).toMatchObject({ status: "cancelled" });
    expect(f.posts).toHaveLength(1);
  });
  it("classifies only attested owned fire runs as automatic and rejects forged identities", async () => {
    const f = fixture();
    await f.approve();
    const fire = await f.dispatch();
    expect(
      f.registry.automations.admission(f.bot.id, {
        runId: fire.runId,
        sessionId: fire.sessionId,
        kind: "foreground",
      }),
    ).toMatchObject({ kind: "automatic-acp" });
    expect(() =>
      f.registry.automations.admission(f.bot.id, {
        runId: `automation:${randomUUID()}`,
        sessionId: fire.sessionId,
      }),
    ).toThrow(/binding/);
    expect(() =>
      f.registry.automations.admission(f.registry.get("default").id, {
        runId: fire.runId,
        sessionId: fire.sessionId,
      }),
    ).toThrow(/binding/);
    expect(
      f.registry.automations.admission(f.bot.id, {
        runId: "ordinary",
        kind: "foreground",
      }),
    ).toEqual({ runId: "ordinary", kind: "foreground" });
  });
  it("rejects named scheduler authority, missing keys, unsupported capability claims, and retargeting", async () => {
    const f = fixture();
    await expect(
      f.registry.automations.validate(f.bot.id, f.job),
    ).rejects.toThrow(/default scheduler/);
    await expect(
      f.registry.automations.validate("default", {
        ...f.job,
        delivery: "home",
      }),
    ).rejects.toThrow(/unsupported/);
    expect(f.consent).not.toHaveBeenCalled();
    await f.approve();
    await expect(
      f.registry.automations.dispatch("default", {
        jobId: f.job.id,
        idempotencyKey: "",
        source: "manual",
      }),
    ).rejects.toThrow(/stable SDK/);
    await expect(
      f.registry.automations.validate("default", {
        ...f.job,
        targetBotId: randomUUID(),
      }),
    ).rejects.toThrow(/immutable/);
    const fire = await f.dispatch();
    await expect(
      f.registry.automations.wait(f.bot.id, fire.fireId),
    ).rejects.toThrow(/default scheduler/);
    await expect(
      f.registry.automations.cancel(f.bot.id, fire.fireId),
    ).rejects.toThrow(/default scheduler/);
  });
  it("does not return a late result after revocation or cancellation", async () => {
    const f = fixture();
    await f.approve();
    const fire = await f.dispatch();
    f.setTranscript(async () => {
      await f.registry.automations.cancelAll();
    });
    await expect(
      f.registry.automations.wait("default", fire.fireId),
    ).rejects.toThrow(/cancellation/);
    expect(f.registry.automations.ledger.get(fire.fireId)?.status).toBe(
      "cancelled",
    );
  });
  it("uses separate per-fire sessions and refuses completion without a current assistant", async () => {
    const f = fixture();
    await f.approve();
    const first = await f.dispatch();
    await f.registry.automations.wait("default", first.fireId);
    const second = await f.dispatch("sdk-fire-2");
    expect(second.sessionId).not.toBe(first.sessionId);
    f.setMessages([]);
    await expect(
      f.registry.automations.wait("default", second.fireId),
    ).rejects.toThrow(/no valid exact result/);
  });
  it("preserves and disables a corrupt named ledger without losing unrelated bot startup", () => {
    const f = fixture();
    const ledgerPath = resolve(
      f.directory,
      "bots",
      "automation-dispatches.json",
    );
    const backupPath = resolve(
      f.directory,
      "bots",
      "automation-dispatches.backup.json",
    );
    writeFileSync(ledgerPath, "corrupt-private-ledger", { mode: 0o600 });
    writeFileSync(backupPath, "corrupt-backup", { mode: 0o600 });
    expect(() => new BotAutomationLedger(f.directory)).toThrow();
    expect(readFileSync(ledgerPath, "utf8")).toBe("corrupt-private-ledger");
  });
});
