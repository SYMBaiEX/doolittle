import { describe, expect, it } from "bun:test";
import type { AgentRuntime } from "@elizaos/core";
import type { GatewayRunner } from "@/gateway/runner";
import type { AppServices } from "@/services";
import type { CronJobRecord } from "@/types";
import type { EnvConfig } from "@/types/runtime";
import { createCronExecutor } from "./cron-executor";

describe("createCronExecutor", () => {
  it("executes webhook actions as bounded JSON POST requests", async () => {
    let received: Record<string, unknown> = {};
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        received = (await request.json()) as Record<string, unknown>;
        return Response.json({ accepted: true });
      },
    });
    const job: CronJobRecord = {
      id: "automation-1",
      name: "Webhook action",
      prompt: `POST ${server.url}`,
      schedule: "manual",
      delivery: "local",
      skills: [],
      status: "active",
      oneShot: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      trigger: { type: "manual" },
      condition: { type: "always" },
      action: {
        type: "webhook",
        method: "POST",
        url: server.url.toString(),
      },
    };
    const executor = createCronExecutor({
      config: {} as EnvConfig,
      services: {} as AppServices,
      runtime: {} as AgentRuntime,
      ensureGateway: () => {
        throw new Error("gateway should not be used");
      },
    });

    try {
      const output = await executor(job, {
        source: "manual",
        payload: { event: "release.ready" },
      });

      expect(JSON.parse(output)).toEqual({ accepted: true });
      expect(received).toMatchObject({
        automation: { id: "automation-1", name: "Webhook action" },
        trigger: "manual",
        payload: { event: "release.ready" },
      });
    } finally {
      server.stop(true);
    }
  });

  it("reports non-success webhook responses as action failures", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("not accepted", { status: 422 }),
    });
    const executor = createCronExecutor({
      config: {} as EnvConfig,
      services: {} as AppServices,
      runtime: {} as AgentRuntime,
      ensureGateway: () => ({}) as GatewayRunner,
    });
    const job = {
      id: "automation-2",
      name: "Rejected webhook",
      prompt: `POST ${server.url}`,
      schedule: "manual",
      delivery: "local",
      skills: [],
      status: "active",
      oneShot: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      action: {
        type: "webhook",
        method: "POST",
        url: server.url.toString(),
      },
    } satisfies CronJobRecord;

    try {
      await expect(
        executor(job, { source: "manual", payload: {} }),
      ).rejects.toThrow("Webhook returned 422: not accepted");
    } finally {
      server.stop(true);
    }
  });
});
