import { expect, it, vi } from "vitest";
import {
  GATEWAY_RECEIVE_COMPLETED_CACHE_LIMIT,
  GatewayReceiveIdempotencyCoordinator,
} from "../../packages/agent/src/gateway/receive/idempotency";
import type { GatewayReceiveOutcome } from "../../packages/agent/src/gateway/receive/outcome-types";
import type { IncomingPlatformMessage } from "../../packages/agent/src/types/gateway";

const cacheLimit = GATEWAY_RECEIVE_COMPLETED_CACHE_LIMIT;
const message = (id: number): IncomingPlatformMessage => ({
  platform: "telegram",
  userId: "user",
  roomId: "room",
  messageId: String(id),
  text: "hello",
});

function fixture() {
  const outcomes = new Map<string, GatewayReceiveOutcome>();
  const findOutcome = vi.fn((key: string) => outcomes.get(key));
  const recordOutcome = vi.fn(
    (
      _message: IncomingPlatformMessage,
      key: string,
      outcome: GatewayReceiveOutcome,
    ) => {
      outcomes.set(key, outcome);
    },
  );
  const coordinator = new GatewayReceiveIdempotencyCoordinator({
    findOutcome,
    recordOutcome,
  });
  const execute = vi.fn(async () => ({
    ok: true,
    response: "done",
    agentCompleted: true,
  }));
  return { coordinator, findOutcome, recordOutcome, execute };
}

it("bounds completed entries and replays evicted outcomes from the store", async () => {
  const { coordinator, findOutcome, execute } = fixture();
  for (let id = 0; id < cacheLimit * 2; id++) {
    await coordinator.receive(message(id), execute);
  }
  findOutcome.mockClear();
  for (let id = 0; id < cacheLimit; id++) {
    expect(await coordinator.receive(message(id), execute)).toMatchObject({
      duplicate: true,
    });
  }
  expect(findOutcome).toHaveBeenCalledTimes(cacheLimit);
  expect(execute).toHaveBeenCalledTimes(cacheLimit * 2);
});

it("refreshes hot entries and bounds entries loaded from the store", async () => {
  const { coordinator, findOutcome, execute } = fixture();
  for (let id = 0; id < cacheLimit; id++)
    await coordinator.receive(message(id), execute);
  await coordinator.receive(message(0), execute);
  await coordinator.receive(message(cacheLimit), execute);
  findOutcome.mockClear();
  await coordinator.receive(message(0), execute);
  expect(findOutcome).not.toHaveBeenCalled();
  await coordinator.receive(message(1), execute);
  expect(findOutcome).toHaveBeenCalledOnce();
  await coordinator.receive(message(2), execute);
  expect(findOutcome).toHaveBeenCalledTimes(2);
  expect(execute).toHaveBeenCalledTimes(cacheLimit + 1);
});

it("does not retain transient or failed executions", async () => {
  const { coordinator, recordOutcome } = fixture();
  const execute = vi.fn(async () => ({ ok: false, response: "retry" }));
  await coordinator.receive(message(0), execute);
  await coordinator.receive(message(0), execute);
  expect(execute).toHaveBeenCalledTimes(2);
  await expect(
    coordinator.receive(message(1), async () => {
      throw new Error("failed");
    }),
  ).rejects.toThrow("failed");
  await coordinator.receive(message(1), execute);
  expect(recordOutcome).not.toHaveBeenCalled();
});
