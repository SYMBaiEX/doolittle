import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { AutomationJobRecord } from "@doolittle/contracts";
import { describe, expect, it } from "vitest";
import { type BackendManager, sourceRuntimeTarget } from "./backend";
import { BotProcessRegistry } from "./bot-process-registry";
import { DesktopExecutionAdmission } from "./execution-admission";

describe.skipIf(process.env.DOOLITTLE_WORKER_E2E !== "1")(
  "named automation offline source worker",
  () => {
    it("submits an attributed durable run, preserves fire identity across restart, and independently cancels", async () => {
      const directory = mkdtempSync(
        resolve(tmpdir(), "doolittle-automation-worker-"),
      );
      const jobs: AutomationJobRecord[] = [];
      let posts = 0;
      const lead = {
        getState: () => ({
          phase: "ready",
          url: "http://lead.invalid",
          name: "Doolittle",
          agentId: "9f21e797-127f-0eba-b547-92f9b113fb1e",
        }),
        getWorkspaceDirectory: () => directory,
      } as unknown as BackendManager;
      const runtimeFetch = (async (
        input: string | URL | Request,
        init?: RequestInit,
      ) => {
        if (String(input) === "http://lead.invalid/cron/jobs")
          return Response.json({ jobs });
        if (String(input).endsWith("/chat/runs") && init?.method === "POST")
          posts += 1;
        return fetch(input, init);
      }) as typeof fetch;
      const create = () =>
        new BotProcessRegistry(
          sourceRuntimeTarget(process.cwd()),
          directory,
          lead,
          directory,
          {
            runtimeFetch,
            admission: new DesktopExecutionAdmission(),
            confirmAutomation: async () => true,
          },
        );
      let registry = create();
      try {
        const bot = registry.create({
          name: "Scheduled Scout",
          persona: "Read evidence without modifying files.",
          model: { provider: "offline", model: "offline" },
        });
        const now = new Date().toISOString();
        const job: AutomationJobRecord = {
          id: randomUUID(),
          targetBotId: bot.id,
          name: "Offline source proof",
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
          await registry.automations.validate("default", job)
        ).approvalId;
        jobs.push(job);
        const input = {
          jobId: job.id,
          source: "manual" as const,
          idempotencyKey: "official-sdk-fire-1",
        };
        const fire = await registry.automations.dispatch("default", input);
        expect(fire).toMatchObject({ status: "accepted", targetBotId: bot.id });
        const result = await registry.automations.wait("default", fire.fireId);
        expect(result.text.length).toBeGreaterThan(0);
        expect(registry.conversations.getRun(fire.runId)).toMatchObject({
          botId: bot.id,
          sessionId: fire.sessionId,
        });
        const worker = await registry.backendFor(bot.id);
        const url = worker.getState().url;
        expect([403, 404]).toContain((await fetch(`${url}/cron/jobs`)).status);
        const receipt = await (
          await fetch(`${url}/chat/runs/${encodeURIComponent(fire.runId)}`)
        ).json();
        expect(receipt).toMatchObject({
          run: {
            runId: fire.runId,
            sessionId: fire.sessionId,
            status: "complete",
          },
        });
        expect(posts).toBe(1);
        await registry.stopAll();
        registry = create();
        expect(
          await registry.automations.dispatch("default", input),
        ).toMatchObject({ fireId: fire.fireId, status: "complete" });
        expect(posts).toBe(1);
        await registry.activate(bot.id);
        expect(await registry.automations.wait("default", fire.fireId)).toEqual(
          result,
        );
        const second = await registry.automations.dispatch("default", {
          ...input,
          idempotencyKey: "official-sdk-fire-2",
        });
        expect(second.sessionId).not.toBe(fire.sessionId);
        await registry.automations.cancel("default", second.fireId);
        expect(registry.automations.ledger.get(second.fireId)?.status).toBe(
          "cancelled",
        );
        expect(registry.automations.ledger.get(fire.fireId)?.status).toBe(
          "complete",
        );
        await expect(
          registry.automations.wait("default", second.fireId),
        ).rejects.toThrow(/without an authorized result/);
        expect(posts).toBe(2);
      } finally {
        await registry.stopAll();
        rmSync(directory, { recursive: true, force: true });
      }
    }, 120_000);
  },
);
