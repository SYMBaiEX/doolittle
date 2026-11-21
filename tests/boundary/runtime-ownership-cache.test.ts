import { beforeEach, expect, it, vi } from "vitest";
import { NativeOwnershipCache } from "../../packages/agent/src/runtime/native/ownership-cache";

const getSnapshot = vi.hoisted(() => vi.fn());

vi.mock(
  "../../packages/agent/src/runtime/native/service-bridge/ownership",
  () => ({
    getNativeOwnershipControlPlane: vi.fn(),
    getNativeOwnershipSnapshot: getSnapshot,
  }),
);

function makeCache() {
  const config = {} as ConstructorParameters<typeof NativeOwnershipCache>[0];
  const gateway = {} as ConstructorParameters<typeof NativeOwnershipCache>[1];
  const runtime = {} as Parameters<NativeOwnershipCache["attachRuntime"]>[0];
  const services = {} as Parameters<NativeOwnershipCache["attachRuntime"]>[1];
  const cache = new NativeOwnershipCache(config, gateway);
  cache.attachRuntime(runtime, services);
  return cache;
}

function deferredSnapshot() {
  let resolve: (snapshot: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => getSnapshot.mockReset());

it("only loads the ownership inventory on demand and shares concurrent reads", async () => {
  const cache = makeCache();
  expect(getSnapshot).not.toHaveBeenCalled();

  const pending = deferredSnapshot();
  const inventory = { profile: "current" };
  getSnapshot.mockReturnValueOnce(pending.promise);
  const first = cache.snapshot();
  const second = cache.snapshot();
  expect(getSnapshot).toHaveBeenCalledTimes(1);

  pending.resolve(inventory);
  await expect(first).resolves.toBe(inventory);
  await expect(second).resolves.toBe(inventory);
  await expect(cache.snapshot()).resolves.toBe(inventory);
  expect(getSnapshot).toHaveBeenCalledTimes(1);
});

it("retries failed reads and ignores an old inventory after reconfiguration", async () => {
  const cache = makeCache();
  getSnapshot.mockRejectedValueOnce(new Error("temporary failure"));
  await expect(cache.snapshot()).rejects.toThrow("temporary failure");

  const old = deferredSnapshot();
  const updated = { profile: "updated" };
  getSnapshot.mockReturnValueOnce(old.promise).mockResolvedValueOnce(updated);
  const inFlight = cache.snapshot();
  cache.updateGatewayConfig(
    {} as Parameters<typeof cache.updateGatewayConfig>[0],
  );
  await expect(cache.snapshot()).resolves.toBe(updated);
  old.resolve({ profile: "old" });
  await inFlight;
  await expect(cache.snapshot()).resolves.toBe(updated);
  expect(getSnapshot).toHaveBeenCalledTimes(3);
});
