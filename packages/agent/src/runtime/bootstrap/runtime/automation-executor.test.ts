import type { AgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRunner } from "@/gateway/runner";
import type { AppServices } from "@/services";
import { serveFetchTest } from "@/testing/fetch-server";
import type { AutomationJobRecord } from "@/types";
import type { EnvConfig } from "@/types/runtime";
import {
  buildAutomationPrompt,
  createAutomationExecutor,
} from "./automation-executor";

const host = vi.hoisted(() => vi.fn());
vi.mock("@/runtime/bootstrap/worker-host-rpc", () => ({
  requestWorkerHost: host,
}));
afterEach(() => {
  host.mockReset();
});

describe("createAutomationExecutor", () => {
  it("dispatches a named bot through host-owned durable runs without borrowing the lead gateway", async () => {
    const job = {
      id: "job",
      targetBotId: "bot",
      prompt: "Review.",
    } as AutomationJobRecord;
    const gateway = vi.fn(() => {
      throw new Error("Lead gateway must not be borrowed.");
    });
    const executor = createAutomationExecutor({
      config: {} as EnvConfig,
      services: {} as AppServices,
      runtime: {} as AgentRuntime,
      ensureGateway: gateway,
    });
    await expect(executor(job, { source: "manual" })).rejects.toThrow(
      /stable automation fire key/,
    );
    expect(host).not.toHaveBeenCalled();
    host
      .mockResolvedValueOnce({
        fireId: "fire",
        targetBotId: "bot",
        sessionId: "owned-session",
        runId: "owned-run",
      })
      .mockResolvedValueOnce({ text: "named result" });
    const owner = vi.fn();
    await expect(
      executor(job, {
        source: "manual",
        idempotencyKey: "exact-sdk-key",
        onOwnedRun: owner,
      }),
    ).resolves.toBe("named result");
    expect(host.mock.calls[0]).toEqual([
      "automation.dispatch",
      {
        jobId: "job",
        idempotencyKey: "exact-sdk-key",
        source: "manual",
        payload: undefined,
      },
      expect.objectContaining({ timeoutMs: 120_000 }),
    ]);
    expect(owner).toHaveBeenCalledWith({
      botId: "bot",
      sessionId: "owned-session",
      runId: "owned-run",
    });
    expect(gateway).not.toHaveBeenCalled();
  });
  it("cancels the actual named target after waiting is aborted", async () => {
    const controller = new AbortController();
    const executor = createAutomationExecutor({
      config: {} as EnvConfig,
      services: {} as AppServices,
      runtime: {} as AgentRuntime,
      ensureGateway: () => {
        throw new Error("No lead gateway");
      },
    });
    host.mockResolvedValueOnce({
      fireId: "fire",
      targetBotId: "bot",
      sessionId: "owned-session",
      runId: "owned-run",
    });
    host.mockImplementationOnce(async () => {
      controller.abort();
      throw new Error("Aborted wait");
    });
    host.mockResolvedValueOnce({ ok: true });
    await expect(
      executor({ targetBotId: "bot", id: "job" } as AutomationJobRecord, {
        source: "manual",
        idempotencyKey: "key",
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow(/Aborted wait/);
    expect(host.mock.calls[2]).toEqual([
      "automation.cancel",
      { fireId: "fire" },
    ]);
  });
  it("builds automation guidance from the runtime-bound Eliza skill inventory", () => {
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
            title: "Official Release",
            description: "Release through Eliza.",
            path: "/managed/release/SKILL.md",
            content: "# Official release guidance",
            source: "managed",
          },
        ],
      },
    } as unknown as AppServices;

    const prompt = buildAutomationPrompt(
      runtime,
      services,
      "Ship it.",
      ["release"],
      {
        source: "manual",
        payload: {},
      },
    );

    expect(prompt).toContain("## Skill: Official Release");
    expect(prompt).toContain("# Official release guidance");
  });

  it("executes webhook actions as bounded JSON POST requests", async () => {
    let received: Record<string, unknown> = {};
    const progress: string[] = [];
    const server = await serveFetchTest(async (request) => {
      received = (await request.json()) as Record<string, unknown>;
      return Response.json({ accepted: true });
    });
    const job: AutomationJobRecord = {
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
    const executor = createAutomationExecutor({
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
        executionId: "automation-execution-1",
        onProgress: (event) => {
          progress.push(`${event.phase}:${event.status}`);
        },
      });

      expect(JSON.parse(output)).toEqual({ accepted: true });
      expect(received).toMatchObject({
        automation: { id: "automation-1", name: "Webhook action" },
        trigger: "manual",
        payload: { event: "release.ready" },
      });
      expect(progress).toEqual(["action:started", "action:completed"]);
    } finally {
      server.stop(true);
    }
  });

  it("reports non-success webhook responses as action failures", async () => {
    const server = await serveFetchTest(
      () => new Response("not accepted", { status: 422 }),
    );
    const executor = createAutomationExecutor({
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
    } satisfies AutomationJobRecord;

    try {
      await expect(
        executor(job, { source: "manual", payload: {} }),
      ).rejects.toThrow("Webhook returned 422: not accepted");
    } finally {
      server.stop(true);
    }
  });

  it("honors cancellation before an automation action starts", async () => {
    const controller = new AbortController();
    controller.abort();
    const progress: string[] = [];
    const executor = createAutomationExecutor({
      config: {} as EnvConfig,
      services: {} as AppServices,
      runtime: {} as AgentRuntime,
      ensureGateway: () => ({}) as GatewayRunner,
    });
    const job = {
      id: "automation-cancelled",
      name: "Cancelled webhook",
      prompt: "POST https://example.com/webhook",
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
        url: "https://example.com/webhook",
      },
    } satisfies AutomationJobRecord;

    await expect(
      executor(job, {
        source: "manual",
        abortSignal: controller.signal,
        onProgress: (event) => {
          progress.push(`${event.phase}:${event.status}`);
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).toEqual(["action:cancelled"]);
  });
});
