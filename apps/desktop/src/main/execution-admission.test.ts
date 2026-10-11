import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DesktopExecutionAdmission } from "./execution-admission";

describe("DesktopExecutionAdmission", () => {
  it("caps all bots at four concurrent executions and automatic ACP at two", () => {
    const admission = new DesktopExecutionAdmission({
      maxConcurrent: 4,
      maxAutomaticAcp: 2,
    });
    const claim = (runId: string, kind: "foreground" | "automatic-acp") =>
      admission.claim({ botId: `bot-${runId}`, runId, sessionId: runId, kind });
    expect(claim("a", "automatic-acp").accepted).toBe(true);
    expect(claim("b", "automatic-acp").accepted).toBe(true);
    expect(claim("c", "automatic-acp")).toEqual({
      accepted: false,
      reason: "automatic_acp_limit",
    });
    expect(claim("c", "foreground").accepted).toBe(true);
    expect(claim("d", "foreground").accepted).toBe(true);
    expect(claim("e", "foreground")).toEqual({
      accepted: false,
      reason: "total_limit",
    });
    expect(admission.list()).toHaveLength(4);
  });

  it("requires the exact lease and releases a child's claims only on child exit", () => {
    const admission = new DesktopExecutionAdmission();
    const accepted = admission.claim({
      botId: "bot-a",
      runId: "run-a",
      sessionId: "session-a",
      kind: "foreground",
    });
    expect(accepted.accepted).toBe(true);
    if (!accepted.accepted) return;
    expect(
      admission.release({
        botId: "bot-b",
        runId: "run-a",
        leaseId: accepted.leaseId,
      }),
    ).toBe(false);
    expect(
      admission.release({
        botId: "bot-a",
        runId: "run-b",
        leaseId: accepted.leaseId,
      }),
    ).toBe(false);
    expect(
      admission.claim({
        botId: "bot-a",
        runId: "run-a",
        sessionId: "session-a",
        kind: "foreground",
      }),
    ).toEqual({
      accepted: false,
      reason: "run_exists",
    });
    admission.releaseBot("bot-b");
    expect(admission.list()).toHaveLength(1);
    admission.releaseBot("bot-a");
    expect(admission.list()).toHaveLength(0);
  });

  it("excludes overlapping mutation roots while allowing disjoint worktrees", () => {
    const admission = new DesktopExecutionAdmission();
    expect(
      admission.claim({
        botId: "lead",
        runId: "lead-run",
        sessionId: "lead-session",
        kind: "foreground",
        mutationRoot: "/repo",
      }).accepted,
    ).toBe(true);
    expect(
      admission.claim({
        botId: "child",
        runId: "child-run",
        sessionId: "child-session",
        kind: "foreground",
        mutationRoot: "/repo/packages/agent",
      }),
    ).toEqual({ accepted: false, reason: "mutation_conflict" });
    expect(
      admission.claim({
        botId: "sibling",
        runId: "sibling-run",
        sessionId: "sibling-session",
        kind: "foreground",
        mutationRoot: "/other-worktree",
      }).accepted,
    ).toBe(true);
  });

  it("requires host-normalized absolute mutation roots for both admission paths", () => {
    const admission = new DesktopExecutionAdmission();
    for (const mutationRoot of [
      "relative/path",
      "/repo/../other",
      "/repo\nchild",
    ]) {
      const input = {
        botId: "bot",
        runId: mutationRoot,
        sessionId: "session",
        kind: "foreground" as const,
        mutationRoot,
      };
      expect(() => admission.claim(input)).toThrow(TypeError);
      expect(() => admission.acquire(input)).toThrow(TypeError);
    }
    expect(admission.list()).toHaveLength(0);
  });

  it("conflicts on a real symlink alias canonicalized by the host", () => {
    const temp = mkdtempSync(join(tmpdir(), "doolittle-admission-"));
    try {
      const workspace = join(temp, "workspace");
      const alias = join(temp, "alias");
      mkdirSync(workspace);
      symlinkSync(workspace, alias);
      const admission = new DesktopExecutionAdmission();
      const owner = admission.claim({
        botId: "owner",
        runId: "owner",
        sessionId: "session",
        kind: "foreground",
        mutationRoot: realpathSync(workspace),
      });
      expect(owner.accepted).toBe(true);
      expect(
        admission.claim({
          botId: "alias",
          runId: "alias",
          sessionId: "session",
          kind: "foreground",
          mutationRoot: realpathSync(alias),
        }),
      ).toEqual({ accepted: false, reason: "mutation_conflict" });
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("bounds 50 bots without denying queued work and gives another bot a turn", async () => {
    const admission = new DesktopExecutionAdmission({
      maxConcurrent: 3,
      maxPerBotActive: 2,
    });
    const results = Array.from({ length: 50 }, (_, index) =>
      admission.acquire({
        botId: `bot-${index}`,
        runId: `run-${index}`,
        sessionId: `session-${index}`,
        kind: "foreground",
      }),
    );
    expect(admission.list()).toHaveLength(3);
    const first = await Promise.all(results.slice(0, 3));
    expect(first.every((result) => result.accepted)).toBe(true);
    let peak = admission.list().length;
    for (let index = 0; index < 47; index++) {
      const lease = first[index] ?? (await results[index]);
      expect(lease.accepted).toBe(true);
      if (lease.accepted) {
        expect(
          admission.release({
            botId: `bot-${index}`,
            runId: `run-${index}`,
            leaseId: lease.leaseId,
          }),
        ).toBe(true);
      }
      peak = Math.max(peak, admission.list().length);
    }
    const all = await Promise.all(results);
    expect(all.every((result) => result.accepted)).toBe(true);
    expect(peak).toBe(3);
  });

  it("rotates bots and skips one blocked by a mutation root", async () => {
    const admission = new DesktopExecutionAdmission({
      maxConcurrent: 2,
      maxPerBotActive: 1,
    });
    const owner = admission.claim({
      botId: "owner",
      runId: "owner",
      sessionId: "s",
      kind: "foreground",
      mutationRoot: "/repo",
    });
    expect(owner.accepted).toBe(true);
    const blocked = admission.acquire({
      botId: "blocked",
      runId: "blocked",
      sessionId: "s",
      kind: "foreground",
      mutationRoot: "/repo/child",
    });
    const free = await admission.acquire({
      botId: "free",
      runId: "free",
      sessionId: "s",
      kind: "foreground",
      mutationRoot: "/other",
    });
    expect(free.accepted).toBe(true);
    if (owner.accepted)
      admission.release({
        botId: "owner",
        runId: "owner",
        leaseId: owner.leaseId,
      });
    expect((await blocked).accepted).toBe(true);
  });

  it("cleans up canceled and stopped queued claims and wakes other bots", async () => {
    const admission = new DesktopExecutionAdmission({
      maxConcurrent: 1,
      maxPending: 2,
      maxPendingPerBot: 1,
    });
    const owner = admission.claim({
      botId: "owner",
      runId: "owner",
      sessionId: "s",
      kind: "foreground",
    });
    const controller = new AbortController();
    const canceled = admission.acquire(
      { botId: "cancel", runId: "cancel", sessionId: "s", kind: "foreground" },
      { signal: controller.signal },
    );
    expect(
      await admission.acquire({
        botId: "cancel",
        runId: "second",
        sessionId: "s",
        kind: "foreground",
      }),
    ).toEqual({ accepted: false, reason: "queue_full" });
    controller.abort();
    await expect(canceled).rejects.toMatchObject({ name: "AbortError" });
    const stopped = admission.acquire({
      botId: "stopped",
      runId: "stopped",
      sessionId: "s",
      kind: "foreground",
    });
    const waiting = admission.acquire({
      botId: "waiting",
      runId: "waiting",
      sessionId: "s",
      kind: "foreground",
    });
    admission.releaseBot("stopped");
    expect(await stopped).toEqual({ accepted: false, reason: "bot_stopped" });
    if (owner.accepted)
      admission.release({
        botId: "owner",
        runId: "owner",
        leaseId: owner.leaseId,
      });
    expect((await waiting).accepted).toBe(true);
  });

  it("times out queued work and validates configuration", async () => {
    expect(() => new DesktopExecutionAdmission({ maxConcurrent: 0 })).toThrow(
      RangeError,
    );
    expect(
      () =>
        new DesktopExecutionAdmission({ maxConcurrent: 2, maxAutomaticAcp: 3 }),
    ).toThrow(RangeError);
    const admission = new DesktopExecutionAdmission({
      maxConcurrent: 1,
      queueTimeoutMs: 5,
    });
    admission.claim({
      botId: "owner",
      runId: "owner",
      sessionId: "s",
      kind: "foreground",
    });
    expect(
      await admission.acquire({
        botId: "waiter",
        runId: "waiter",
        sessionId: "s",
        kind: "foreground",
      }),
    ).toEqual({ accepted: false, reason: "queue_timeout" });
  });

  it("rotates pending bots instead of draining one bot first", async () => {
    const admission = new DesktopExecutionAdmission({ maxConcurrent: 1 });
    const owner = admission.claim({
      botId: "owner",
      runId: "owner",
      sessionId: "s",
      kind: "foreground",
    });
    const a1 = admission.acquire({
      botId: "a",
      runId: "a1",
      sessionId: "s",
      kind: "foreground",
    });
    const a2 = admission.acquire({
      botId: "a",
      runId: "a2",
      sessionId: "s",
      kind: "foreground",
    });
    const b1 = admission.acquire({
      botId: "b",
      runId: "b1",
      sessionId: "s",
      kind: "foreground",
    });
    expect(admission.snapshot()).toMatchObject({
      capacity: { total: 1, perBot: 1, pending: 512 },
      active: 1,
      pending: 3,
      bots: { a: { active: 0, pending: 2 }, b: { active: 0, pending: 1 } },
    });
    if (!owner.accepted) throw new Error("Owner was not admitted.");
    admission.release({
      botId: "owner",
      runId: "owner",
      leaseId: owner.leaseId,
    });
    const first = await a1;
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    admission.release({ botId: "a", runId: "a1", leaseId: first.leaseId });
    const second = await b1;
    expect(second.accepted).toBe(true);
    if (!second.accepted) return;
    admission.release({ botId: "b", runId: "b1", leaseId: second.leaseId });
    expect((await a2).accepted).toBe(true);
  });

  it("uses only host authority for mutation roots and cancels a waiting host claim", async () => {
    const admission = new DesktopExecutionAdmission({ maxConcurrent: 2 });
    const owner = await admission.handle(
      "owner",
      "execution.claim",
      {
        runId: "owner",
        sessionId: "s",
        kind: "foreground",
        mutationRoot: "/ignored",
      },
      { mutationRoot: "/repo" },
    );
    expect(owner.accepted).toBe(true);
    const controller = new AbortController();
    const blocked = admission.handle(
      "child",
      "execution.claim",
      {
        runId: "child",
        sessionId: "s",
        kind: "foreground",
        mutationRoot: "/other",
      },
      { mutationRoot: "/repo/child" },
      controller.signal,
    );
    expect(admission.snapshot().pending).toBe(1);
    controller.abort();
    await expect(blocked).rejects.toMatchObject({ name: "AbortError" });
    expect(admission.snapshot().pending).toBe(0);
    const disjoint = await admission.handle(
      "child",
      "execution.claim",
      {
        runId: "child",
        sessionId: "s",
        kind: "foreground",
        mutationRoot: "/repo",
      },
      { mutationRoot: "/other" },
    );
    expect(disjoint.accepted).toBe(true);
  });
});
