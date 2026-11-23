import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { executeGatewayReceiveTurn } from "../../packages/agent/src/gateway/receive/execution";
import {
  GatewayReceiveIdempotencyCoordinator,
  gatewayInboundIdempotencyKey,
} from "../../packages/agent/src/gateway/receive/idempotency";
import { GatewayIngressSpool } from "../../packages/agent/src/gateway/receive/ingress-spool";
import { GatewayIngressWorker } from "../../packages/agent/src/gateway/receive/ingress-worker";
import { RunControllerService } from "../../packages/agent/src/services/run-controller-service";

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
const message = {
  platform: "slack" as const,
  userId: "user",
  roomId: "room",
  messageId: "one",
  text: "hello",
};
const session = { ...message, sessionKey: "session" };
const legacyRunId = `gateway:${createHash("sha256")
  .update(gatewayInboundIdempotencyKey(message) ?? "")
  .digest("hex")
  .slice(0, 48)}`;
type ExecutionDeps = Parameters<typeof executeGatewayReceiveTurn>[0];

it.each(["crash", "error"] as const)(
  "starts a new turn after a prior terminal %s receipt",
  async (failure) => {
    const path = mkdtempSync(join(tmpdir(), "gateway-attempt-"));
    directories.push(path);
    const original = new GatewayIngressSpool(path);
    const receipt = original.accept(message);
    const claimed = original.claim(receipt.receiptId);
    if (!claimed) throw new Error("Missing receipt");
    const runController = new RunControllerService(path);
    const started: string[] = [];
    let fail = true;
    const executeTurn: NonNullable<ExecutionDeps["executeTurn"]> = async (
      input,
      context,
    ) => {
      const runId = input.runId;
      if (!runId) throw new Error("Missing run ID");
      context.services.runController.startTurn({
        sessionId: session.sessionKey,
        roomId: session.sessionKey,
        runId,
        source: "slack",
        message: input.message,
        runDepth: "standard",
        configuredMaxIterations: 15,
        progressMode: "new",
      });
      started.push(runId);
      if (fail) {
        if (failure === "error")
          context.services.runController.finishTurn(
            session.sessionKey,
            "error",
            "turn failed",
          );
        throw new Error("turn failed");
      }
      context.services.runController.finishTurn(session.sessionKey, "complete");
      return { response: "done", sessionId: session.sessionKey };
    };
    const deps = {
      context: { config: { workspaceDir: path }, services: { runController } },
      message,
      session,
      executeTurn,
    } as unknown as ExecutionDeps;
    await expect(
      executeGatewayReceiveTurn(deps, { ingressAttempt: 1 }),
    ).rejects.toThrow("turn failed");
    expect(started).toEqual([legacyRunId]);
    if (failure === "crash")
      deps.context.services.runController = new RunControllerService(path);
    else original.setStatus(claimed, "retrying");
    fail = false;
    const coordinator = new GatewayReceiveIdempotencyCoordinator({
      findOutcome: () => undefined,
      recordOutcome: () => {},
    });
    const receive = vi.fn((input, options) =>
      coordinator.receive(
        input,
        async (abortSignal) => {
          const result = await executeGatewayReceiveTurn(deps, {
            ...options,
            abortSignal,
          });
          return { ok: true, response: result.response, agentCompleted: true };
        },
        options,
      ),
    );
    const spool = new GatewayIngressSpool(path);
    const worker = new GatewayIngressWorker(spool, receive);
    try {
      worker.start();
      await worker.idle();
      expect(started).toEqual([legacyRunId, `${legacyRunId}:attempt:2`]);
      expect(spool.history()[0]?.status).toBe("completed");
      expect(receive).toHaveBeenCalledOnce();
    } finally {
      await worker.stop();
    }
  },
);

it.each([undefined, 0, 1])(
  "preserves the existing run ID for attempt %s",
  async (ingressAttempt) => {
    const executeTurn = vi.fn<NonNullable<ExecutionDeps["executeTurn"]>>(
      async () => ({ response: "done", sessionId: "session" }),
    );
    const deps = {
      context: {
        config: { workspaceDir: "/workspace" },
        services: { runController: new RunControllerService() },
      },
      message,
      session,
      executeTurn,
    } as unknown as ExecutionDeps;
    await executeGatewayReceiveTurn(deps, { ingressAttempt });
    expect(executeTurn.mock.calls[0]?.[0].runId).toBe(legacyRunId);
  },
);
