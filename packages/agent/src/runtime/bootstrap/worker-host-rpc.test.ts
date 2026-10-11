import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./bot-profile", () => ({ readWorkerBotProfile: () => null }));

import { requestWorkerHost, WORKER_HOST_RPC_PROTOCOL } from "./worker-host-rpc";

const originalSend = process.send;
afterEach(() => {
  process.send = originalSend;
  vi.unstubAllEnvs();
});

describe("worker-host receipt acknowledgement", () => {
  it("ACKs a pending success before resolving the caller", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    vi.stubEnv("DOOLITTLE_HOST_BOT_ID", "lead");
    const sent: Array<Record<string, unknown>> = [];
    process.send = vi.fn((message: Record<string, unknown>) => {
      sent.push(message);
      return true;
    }) as typeof process.send;
    const result = requestWorkerHost("execution.claim", { runId: "run" });
    const request = sent[0];
    process.emit("message", {
      protocol: WORKER_HOST_RPC_PROTOCOL,
      id: request.id,
      botId: "lead",
      sequence: request.sequence,
      ok: true,
      result: { accepted: true, leaseId: "lease" },
    });
    expect(await result).toEqual({ accepted: true, leaseId: "lease" });
    expect(sent[1]).toMatchObject({
      protocol: WORKER_HOST_RPC_PROTOCOL,
      id: request.id,
      botId: "lead",
      sequence: request.sequence,
      ack: true,
    });
  });

  it("cancels a successful reply that arrives after caller cancellation", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    vi.stubEnv("DOOLITTLE_HOST_BOT_ID", "lead");
    const sent: Array<Record<string, unknown>> = [];
    process.send = vi.fn((message: Record<string, unknown>) => {
      sent.push(message);
      return true;
    }) as typeof process.send;
    const controller = new AbortController();
    const result = requestWorkerHost(
      "execution.claim",
      { runId: "run" },
      { signal: controller.signal },
    );
    const request = sent[0];
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    process.emit("message", {
      protocol: WORKER_HOST_RPC_PROTOCOL,
      id: request.id,
      botId: "lead",
      sequence: request.sequence,
      ok: true,
      result: { accepted: true, leaseId: "lease" },
    });
    expect(sent.slice(1).map((message) => message.cancel)).toEqual([
      true,
      true,
    ]);
    expect(sent.some((message) => message.ack === true)).toBe(false);
  });

  it("keeps control headroom beside sixteen pending claims", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    vi.stubEnv("DOOLITTLE_HOST_BOT_ID", "lead");
    const sent: Array<Record<string, unknown>> = [];
    process.send = vi.fn((message: Record<string, unknown>) => {
      sent.push(message);
      return true;
    }) as typeof process.send;
    const controllers = Array.from({ length: 16 }, () => new AbortController());
    const claims = controllers.map((controller, index) =>
      requestWorkerHost(
        "execution.claim",
        { runId: `claim-${index}` },
        { signal: controller.signal },
      ),
    );
    await expect(
      requestWorkerHost("execution.claim", { runId: "overflow" }),
    ).rejects.toThrow("Too many execution claims");
    const release = requestWorkerHost("execution.release", {
      runId: "run",
      leaseId: "lease",
    });
    const request = sent.find(
      (message) => message.operation === "execution.release",
    );
    expect(request).toBeDefined();
    process.emit("message", {
      protocol: WORKER_HOST_RPC_PROTOCOL,
      id: request?.id,
      botId: "lead",
      sequence: request?.sequence,
      ok: true,
      result: { released: true },
    });
    expect(await release).toEqual({ released: true });
    for (const controller of controllers) controller.abort();
    await Promise.allSettled(claims);
  });

  it("ACKs repeated failures and permits later requests without a lifetime quota", async () => {
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    vi.stubEnv("DOOLITTLE_HOST_BOT_ID", "lead");
    const sent: Array<Record<string, unknown>> = [];
    process.send = vi.fn((message: Record<string, unknown>) => {
      sent.push(message);
      return true;
    }) as typeof process.send;
    for (let index = 0; index < 40; index++) {
      const failed = requestWorkerHost("codex.auth", null);
      const request = sent.at(-1);
      process.emit("message", {
        protocol: WORKER_HOST_RPC_PROTOCOL,
        id: request?.id,
        botId: "lead",
        sequence: request?.sequence,
        ok: false,
      });
      await expect(failed).rejects.toThrow("host connection");
    }
    const later = requestWorkerHost("execution.release", {
      runId: "run",
      leaseId: "lease",
    });
    const request = sent.at(-1);
    process.emit("message", {
      protocol: WORKER_HOST_RPC_PROTOCOL,
      id: request?.id,
      botId: "lead",
      sequence: request?.sequence,
      ok: true,
      result: { released: true },
    });
    expect(await later).toEqual({ released: true });
    expect(sent.filter((message) => message.ack === true)).toHaveLength(41);
  });
});
