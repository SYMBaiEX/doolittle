import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { GatewayReceiveIdempotencyCoordinator } from "../../packages/agent/src/gateway/receive/idempotency";
import { GatewayIngressSpool } from "../../packages/agent/src/gateway/receive/ingress-spool";
import { GatewayIngressWorker } from "../../packages/agent/src/gateway/receive/ingress-worker";
import type { GatewayReceiveOutcome } from "../../packages/agent/src/gateway/receive/outcome-types";

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
const outcome = { ok: true, response: "done", agentCompleted: true };

function directory() {
  const path = mkdtempSync(join(tmpdir(), "ingress-recovery-"));
  directories.push(path);
  return path;
}

it("durably recovers processing receipts on restart and executes them once", async () => {
  const path = directory();
  const original = new GatewayIngressSpool(path);
  const receipt = original.accept(message);
  original.claim(receipt.receiptId);
  const spool = new GatewayIngressSpool(path);
  const receive = vi.fn(async () => outcome);
  const worker = new GatewayIngressWorker(spool, receive);
  try {
    worker.start();
    await worker.idle();
    expect(receive).toHaveBeenCalledOnce();
    expect(new GatewayIngressSpool(path).history()[0]?.status).toBe(
      "completed",
    );
    const events = readFileSync(spool.pathname, "utf8");
    expect(events).toContain('"status":"completed"');
    await worker.stop();
    worker.start();
    await worker.idle();
    expect(receive).toHaveBeenCalledOnce();
  } finally {
    await worker.stop();
  }
});

it("retries an interrupted graceful stop on the next start", async () => {
  const path = directory();
  const spool = new GatewayIngressSpool(path);
  spool.accept(message);
  const receive = vi
    .fn()
    .mockImplementationOnce(
      (_message, { abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise((_, reject) => {
          abortSignal.addEventListener(
            "abort",
            () => reject(abortSignal.reason),
            { once: true },
          );
        }),
    )
    .mockResolvedValue(outcome);
  const worker = new GatewayIngressWorker(spool, receive);
  try {
    worker.start();
    expect(receive).toHaveBeenCalledOnce();
    await worker.stop();
    expect(new GatewayIngressSpool(path).history()[0]?.status).toBe(
      "interrupted",
    );
    worker.start();
    await worker.idle();
    expect(receive).toHaveBeenCalledTimes(2);
    expect(spool.history()[0]?.status).toBe("completed");
  } finally {
    await worker.stop();
  }
});

it("does not re-execute a durable outcome recovered before ingress completion", async () => {
  const path = directory();
  const outcomes = new Map<string, GatewayReceiveOutcome>();
  const store = {
    findOutcome: (key: string) => outcomes.get(key),
    recordOutcome: (
      _message: unknown,
      key: string,
      value: GatewayReceiveOutcome,
    ) => {
      outcomes.set(key, value);
    },
  };
  const original = new GatewayIngressSpool(path);
  const receipt = original.accept(message);
  original.claim(receipt.receiptId);
  const execute = vi.fn(async () => outcome);
  await new GatewayReceiveIdempotencyCoordinator(store).receive(
    message,
    execute,
  );
  const coordinator = new GatewayReceiveIdempotencyCoordinator(store);
  const receive = vi.fn((input, options) =>
    coordinator.receive(input, execute, options),
  );
  const spool = new GatewayIngressSpool(path);
  const worker = new GatewayIngressWorker(spool, receive);
  try {
    worker.start();
    await worker.idle();
    expect(receive).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    expect(spool.history()[0]?.status).toBe("completed");
  } finally {
    await worker.stop();
  }
});

it("leaves recovery restartable when the durable transition fails", async () => {
  const spool = new GatewayIngressSpool(directory());
  const receipt = spool.accept(message);
  spool.claim(receipt.receiptId);
  const receive = vi.fn(async () => outcome);
  const transition = vi.spyOn(spool, "setStatus").mockImplementationOnce(() => {
    throw new Error("journal unavailable");
  });
  const worker = new GatewayIngressWorker(spool, receive);
  try {
    expect(() => worker.start()).toThrow("journal unavailable");
    expect(receive).not.toHaveBeenCalled();
    transition.mockRestore();
    worker.start();
    await worker.idle();
    expect(receive).toHaveBeenCalledOnce();
  } finally {
    transition.mockRestore();
    await worker.stop();
  }
});

it("starts an empty spool without receiving work", async () => {
  const receive = vi.fn(async () => outcome);
  const worker = new GatewayIngressWorker(
    new GatewayIngressSpool(directory()),
    receive,
  );
  try {
    worker.start();
    await worker.idle();
    expect(receive).not.toHaveBeenCalled();
  } finally {
    await worker.stop();
  }
});
