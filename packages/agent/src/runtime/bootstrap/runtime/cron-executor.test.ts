import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import type { GatewayRunner } from "@/gateway/runner";
import type { AppServices } from "@/services";
import { serveFetchTest } from "@/testing/fetch-server";
import type { CronJobRecord } from "@/types";
import type { EnvConfig } from "@/types/runtime";
import { buildCronPrompt, createCronExecutor } from "./cron-executor";

describe("createCronExecutor", () => {
  it("builds automation guidance from the official Eliza skill inventory", () => {
    const runtime = {
      getService: (name: string) =>
        name === "AGENT_SKILLS_SERVICE"
          ? {
              getLoadedSkills: () => [
                {
                  slug: "release",
                  name: "Official Release",
                  description: "Release through Eliza.",
                  path: "/managed/release",
                  content: "# Official release guidance",
                  source: "managed",
                  sourceDir: "/managed",
                  precedence: 80,
                },
              ],
            }
          : null,
    } as unknown as AgentRuntime;
    const services = {
      skills: {
        list: () => [
          {
            slug: "release",
            title: "Legacy Release",
            description: "Legacy local copy.",
            path: "/workspace/release/SKILL.md",
            content: "# Legacy guidance",
            source: "workspace",
          },
        ],
      },
    } as unknown as AppServices;

    const prompt = buildCronPrompt(runtime, services, "Ship it.", ["release"], {
      source: "manual",
      payload: {},
    });

    expect(prompt).toContain("## Skill: Official Release");
    expect(prompt).toContain("# Official release guidance");
    expect(prompt).not.toContain("Legacy guidance");
  });

  it("executes webhook actions as bounded JSON POST requests", async () => {
    let received: Record<string, unknown> = {};
    const server = await serveFetchTest(async (request) => {
      received = (await request.json()) as Record<string, unknown>;
      return Response.json({ accepted: true });
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
    const server = await serveFetchTest(
      () => new Response("not accepted", { status: 422 }),
    );
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
