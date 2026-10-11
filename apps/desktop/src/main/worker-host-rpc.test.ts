import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { attachWorkerHostRpc } from "./worker-host-rpc";

const protocol = "doolittle-worker-host-v1";
const id = "a4af1e7a-2712-4e43-8ca4-4334e5d63870";
const botId = "bot";
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function child() {
  const emitter = new EventEmitter();
  const sent: unknown[] = [];
  return Object.assign(emitter, {
    connected: true,
    send: vi.fn((value: unknown, callback?: (error: Error | null) => void) => {
      sent.push(value);
      callback?.(null);
      return true;
    }),
    sent,
    request(operation = "execution.claim", requestId = id, sequence = 1) {
      emitter.emit("message", {
        protocol,
        id: requestId,
        botId,
        sequence,
        operation,
        payload: { runId: "run" },
      });
    },
    ack(sequence = 1) {
      emitter.emit("message", { protocol, id, botId, sequence, ack: true });
    },
    cancel(sequence = 1) {
      emitter.emit("message", { protocol, id, botId, sequence, cancel: true });
    },
  });
}

describe("worker-host grant receipts", () => {
  it("rolls back a grant canceled before the handler resolves", async () => {
    const worker = child();
    let grant: (result: unknown) => void = () => undefined;
    const handler = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          grant = resolve;
        }),
    );
    const rollback = vi.fn();
    const detach = attachWorkerHostRpc(worker, botId, handler, {
      onAbandonedResult: rollback,
    });
    worker.request();
    await settle();
    worker.cancel();
    grant({ accepted: true, leaseId: id });
    await settle();
    expect(rollback).toHaveBeenCalledExactlyOnceWith(
      { operation: "execution.claim", payload: { runId: "run" } },
      { accepted: true, leaseId: id },
    );
    expect(worker.sent).toEqual([]);
    detach();
  });

  it("rolls back an unacknowledged reply, but not an acknowledged one", async () => {
    const worker = child();
    const rollback = vi.fn();
    const detach = attachWorkerHostRpc(
      worker,
      botId,
      async () => ({ accepted: true, leaseId: id }),
      { onAbandonedResult: rollback },
    );
    worker.request();
    await settle();
    worker.cancel();
    expect(rollback).toHaveBeenCalledOnce();
    worker.cancel();
    expect(rollback).toHaveBeenCalledOnce();
    detach();

    const acknowledged = child();
    const retained = vi.fn();
    const detachAck = attachWorkerHostRpc(
      acknowledged,
      botId,
      async () => ({ accepted: true, leaseId: id }),
      { onAbandonedResult: retained },
    );
    acknowledged.request();
    await settle();
    acknowledged.ack();
    acknowledged.cancel();
    expect(retained).not.toHaveBeenCalled();
    detachAck();
  });

  it("reserves control headroom when sixteen claims are outstanding", async () => {
    const worker = child();
    const handler = vi.fn(() => new Promise<unknown>(() => undefined));
    const detach = attachWorkerHostRpc(worker, botId, handler);
    for (let index = 0; index < 16; index++)
      worker.request("execution.claim", randomUUID(), index + 1);
    worker.request("execution.claim", randomUUID(), 17);
    worker.request("execution.release", randomUUID(), 18);
    await settle();
    expect(handler).toHaveBeenCalledTimes(17);
    expect(handler.mock.calls.at(-1)?.[0]).toMatchObject({
      operation: "execution.release",
    });
    expect(worker.sent).toContainEqual(
      expect.objectContaining({
        sequence: 17,
        ok: false,
        code: "host_backpressure",
      }),
    );
    detach();
  });

  it("ignores stale cancel and ACK after an ID is reused with a higher sequence", async () => {
    const worker = child();
    const rollback = vi.fn();
    const detach = attachWorkerHostRpc(
      worker,
      botId,
      async () => ({ accepted: true, leaseId: id }),
      { onAbandonedResult: rollback },
    );
    worker.request();
    await settle();
    worker.cancel();
    worker.request("execution.claim", id, 2);
    await settle();
    worker.cancel(1);
    worker.ack(1);
    worker.ack(2);
    expect(rollback).toHaveBeenCalledOnce();
    detach();
  });
});
