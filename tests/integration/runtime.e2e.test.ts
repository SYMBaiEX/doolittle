import { randomUUID } from "node:crypto";
import type { AutomationJobRecord } from "@doolittle/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertBotSessionRequest,
  attributeBotSessionResponse,
} from "../../apps/desktop/src/main/bot-session-routing";
import { runtimeHarness } from "../support/runtime-harness";

type Harness = Awaited<ReturnType<typeof runtimeHarness>>;
type Identity = {
  botId: string;
  agentId: string;
  processId: number;
  threadId: number;
};

async function json<T>(url: string, path: string): Promise<T> {
  const response = await fetch(`${url}${path}`, { redirect: "error" });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json() as Promise<T>;
}

async function waitForRun(url: string, runId: string) {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    const receipt = await json<{
      run: { runId: string; status: string; botId: string };
    }>(url, `/chat/runs/${encodeURIComponent(runId)}`);
    if (["complete", "error", "cancelled"].includes(receipt.run.status)) {
      expect(receipt.run.status).toBe("complete");
      return receipt.run;
    }
    await new Promise<void>((done) => setTimeout(done, 150));
  }
  throw new Error("Offline SDK run timed out.");
}

// Explicit opt-in: the source build starts one real engine child and two SDK
// worker_threads. This fixture is offline, not a paid-provider or packaged-app proof.
describe("fresh shared-engine source runtime acceptance", () => {
  let h: Harness;
  beforeAll(async () => {
    if (process.env.DOOLITTLE_RUN_RUNTIME_E2E !== "1")
      throw new Error(
        "Set DOOLITTLE_RUN_RUNTIME_E2E=1 to run the source runtime acceptance suite.",
      );
    h = await runtimeHarness();
  }, 90_000);
  afterAll(async () => {
    await h?.close();
  }, 30_000);

  it("isolates two named SDK workers in one process and enforces independently approved roots through worker RPC", async () => {
    const [a, b] = h.bots;
    const [urlA, urlB] = h.urls;
    const [sessionA, sessionB, sessionOther] = h.sessions;
    const [lead, identityA, identityB] = await Promise.all([
      json<Identity>(h.leadUrl, "/runtime/bot-identity"),
      json<Identity>(urlA, "/runtime/bot-identity"),
      json<Identity>(urlB, "/runtime/bot-identity"),
    ]);
    expect(lead.threadId).toBe(0);
    expect(identityA).toMatchObject({
      botId: a.id,
      agentId: a.agentId,
      processId: lead.processId,
    });
    expect(identityB).toMatchObject({
      botId: b.id,
      agentId: b.agentId,
      processId: lead.processId,
    });
    expect(identityA.threadId).toBeGreaterThan(0);
    expect(identityB.threadId).toBeGreaterThan(0);
    expect(identityA.threadId).not.toBe(identityB.threadId);
    expect(identityA.agentId).not.toBe(identityB.agentId);
    expect(urlA).not.toBe(urlB);

    const read = (url: string, session: string) =>
      fetch(`${url}/workspace/read?path=scope.txt`, {
        headers: { "x-doolittle-origin-conversation": session },
        redirect: "error",
      });
    const [readA, readB] = await Promise.all([
      read(urlA, sessionA),
      read(urlA, sessionB),
    ]);
    expect(readA.status).toBe(200);
    expect(readB.status).toBe(200);
    expect(await readA.json()).toMatchObject({ content: "scope-0" });
    expect(await readB.json()).toMatchObject({ content: "scope-1" });
    expect((await read(urlA, sessionOther)).status).toBe(409);
    expect((await read(urlB, sessionA)).status).toBe(409);
    expect((await read(urlA, `session-${randomUUID()}`)).status).toBe(409);
    expect((await fetch(`${urlA}/workspace/read?path=scope.txt`)).status).toBe(
      409,
    );
    expect((await fetch(`${urlA}/runtime/bots/${b.id}`)).status).toBe(404);
    expect((await fetch(`${urlB}/runtime/bots/${a.id}`)).status).toBe(404);
  }, 60_000);

  it("admits and attributes offline SDK tasks, binds ACP ownership, and restores history after one-worker restart", async () => {
    const [a, b] = h.bots;
    const [urlA, urlB] = h.urls;
    const [sessionA, , sessionOther] = h.sessions;
    const runId = `run-${randomUUID()}`;
    const mismatch = await fetch(`${urlA}/chat/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId,
        roomId: sessionA,
        message: "Denied",
        source: "desktop",
        projectId: h.projects[1].id,
      }),
    });
    expect(mismatch.status).toBe(409);
    expect(await mismatch.json()).toMatchObject({
      code: "session_project_mismatch",
    });

    const blocker = h.admission.claim({
      botId: "default",
      runId: "acceptance-seat",
      sessionId: "acceptance-seat",
      kind: "foreground",
    });
    expect(blocker.accepted).toBe(true);
    const marker = `SDK-offline-${randomUUID()}`;
    const acceptedRun = `run-${randomUUID()}`;
    try {
      const response = await fetch(`${urlA}/chat/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: acceptedRun,
          roomId: sessionA,
          message: marker,
          source: "desktop",
          projectId: h.projects[0].id,
        }),
      });
      expect(response.status, await response.clone().text()).toBe(202);
      expect(await response.json()).toMatchObject({
        run_id: acceptedRun,
        bot_id: a.id,
      });
      h.registry.bindRun(a.id, sessionA, acceptedRun);
      expect(
        (
          await json<{ run: { status: string; botId: string } }>(
            urlA,
            `/chat/runs/${acceptedRun}`,
          )
        ).run,
      ).toMatchObject({ status: "waiting", botId: a.id });
    } finally {
      if (blocker.accepted)
        expect(
          h.admission.release({
            botId: "default",
            runId: "acceptance-seat",
            leaseId: blocker.leaseId,
          }),
        ).toBe(true);
    }
    expect(await waitForRun(urlA, acceptedRun)).toMatchObject({
      runId: acceptedRun,
      botId: a.id,
    });
    const transcript = await json<{
      messages: Array<{ role: string; text: string }>;
    }>(
      urlA,
      `/sessions/messages?sessionId=${sessionA}&throughRunId=${acceptedRun}`,
    );
    expect(
      transcript.messages.some(
        (row) => row.role === "user" && row.text.includes(marker),
      ),
    ).toBe(true);
    expect(
      (
        await json<{ runs: Array<{ runId: string }> }>(urlB, "/chat/runs")
      ).runs.some((row) => row.runId === acceptedRun),
    ).toBe(false);

    // Fixture ACP child: only protocol admission/attribution is proved here.
    const request = {
      requestId: `acp-${randomUUID()}`,
      botId: a.id,
      method: "POST" as const,
      path: "/acp/session/new",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        originConversationId: sessionA,
        cwd: h.workspaces[0],
        mcpServers: [],
        _meta: { "doolittle/editor-context": true },
      }),
    };
    const init = await fetch(`${urlA}/acp/initialize`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-doolittle-origin-conversation": sessionA,
      },
      body: JSON.stringify({
        originConversationId: sessionA,
        workspacePath: h.workspaces[0],
      }),
    });
    expect(init.status).toBe(200);
    await assertBotSessionRequest(h.registry, request, a.id);
    const created = await fetch(`${urlA}/acp/session/new`, {
      method: "POST",
      headers: {
        ...request.headers,
        "x-doolittle-origin-conversation": sessionA,
      },
      body: request.body,
    });
    expect(created.status, await created.clone().text()).toBe(200);
    const attributed = await attributeBotSessionResponse(
      h.registry,
      request,
      a.id,
      {
        status: created.status,
        statusText: created.statusText,
        headers: {},
        body: await created.text(),
      },
    );
    const acpSession = (
      JSON.parse(attributed.body) as { session: { sessionId: string } }
    ).session.sessionId;
    expect(
      h.registry.assertAcpSessionOwner(a.id, acpSession).originConversationId,
    ).toBe(sessionA);
    await expect(
      assertBotSessionRequest(
        h.registry,
        {
          ...request,
          botId: b.id,
          path: "/acp/editor/context",
          body: JSON.stringify({
            sessionId: acpSession,
            activeFile: "scope.txt",
          }),
          originConversationId: sessionOther,
        },
        b.id,
      ),
    ).rejects.toThrow(/another bot/u);

    await h.registry.stop(a.id);
    expect((await fetch(`${urlB}/health`)).status).toBe(200);
    expect((await h.registry.backendFor(b.id)).getState().url).toBe(urlB);
    const restartedUrl = (await h.registry.backendFor(a.id)).getState()
      .url as string;
    expect(
      await json<Identity>(restartedUrl, "/runtime/bot-identity"),
    ).toMatchObject({ botId: a.id, agentId: a.agentId });
    const persisted = await json<{
      messages: Array<{ role: string; text: string }>;
    }>(
      restartedUrl,
      `/sessions/messages?sessionId=${sessionA}&throughRunId=${acceptedRun}`,
    );
    expect(
      persisted.messages.some(
        (row) => row.role === "user" && row.text.includes(marker),
      ),
    ).toBe(true);
    const restoredRead = await fetch(
      `${restartedUrl}/workspace/read?path=scope.txt`,
      {
        headers: { "x-doolittle-origin-conversation": sessionA },
      },
    );
    expect(restoredRead.status).toBe(200);
    expect(await restoredRead.json()).toMatchObject({ content: "scope-0" });
    expect((await fetch(`${urlB}/health`)).status).toBe(200);
  }, 90_000);

  it("hands an approved manual automation to the attributed SDK worker, then cancels a separate fire", async () => {
    const bot = h.bots[1];
    const now = new Date().toISOString();
    const job: AutomationJobRecord = {
      id: randomUUID(),
      targetBotId: bot.id,
      name: "Offline worker handoff",
      prompt: "Say hello.",
      schedule: "manual",
      trigger: { type: "manual" },
      action: { type: "run-agent", prompt: "Say hello." },
      skills: [],
      delivery: "local",
      status: "active",
      oneShot: false,
      createdAt: now,
      updatedAt: now,
    };
    job.targetApprovalId = (
      await h.registry.automations.validate("default", job)
    ).approvalId;
    h.jobs.push(job);
    const first = await h.registry.automations.dispatch("default", {
      jobId: job.id,
      source: "manual",
      idempotencyKey: `fire-${randomUUID()}`,
    });
    expect(first).toMatchObject({ status: "accepted", targetBotId: bot.id });
    const result = await h.registry.automations.wait("default", first.fireId);
    expect(result.text.length).toBeGreaterThan(0);
    expect(h.registry.conversations.getRun(first.runId)).toMatchObject({
      botId: bot.id,
      sessionId: first.sessionId,
    });
    expect(await waitForRun(h.urls[1], first.runId)).toMatchObject({
      botId: bot.id,
    });
    expect([403, 404]).toContain(
      (await fetch(`${h.urls[1]}/cron/jobs`)).status,
    );
    const second = await h.registry.automations.dispatch("default", {
      jobId: job.id,
      source: "manual",
      idempotencyKey: `fire-${randomUUID()}`,
    });
    expect(second.sessionId).not.toBe(first.sessionId);
    await h.registry.automations.cancel("default", second.fireId);
    expect(h.registry.automations.ledger.get(second.fireId)?.status).toBe(
      "cancelled",
    );
    expect(h.registry.automations.ledger.get(first.fireId)?.status).toBe(
      "complete",
    );
  }, 90_000);
});
