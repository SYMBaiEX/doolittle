import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createGatewayRunnerControlPlane,
  type GatewayRunnerControlPlaneDependencies,
} from "../../packages/agent/src/gateway/runner/control-plane";
import type { GatewayRunnerLifecycleHost } from "../../packages/agent/src/gateway/runner/lifecycle/types";
import { createDeferred } from "../support/deferred";

vi.mock("../../packages/agent/src/config/gateway", () => ({
  loadGatewayConfig: () => ({ platforms: { telegram: { enabled: true } } }),
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function createGateway() {
  const starting = createDeferred<void>();
  const stopping = createDeferred<void>();
  stopping.resolve();
  const active = new Set<object>();
  const createAdapter = vi.fn(() => {
    const adapter = {
      start: vi.fn(async () => {
        await starting.promise;
        active.add(adapter);
      }),
      stop: vi.fn(async () => {
        await stopping.promise;
        active.delete(adapter);
      }),
      health: vi.fn().mockResolvedValue({}),
    };
    return adapter;
  });
  const host = {
    context: { config: {}, services: { hooks: { emit: vi.fn() } } },
    adapters: new Map(),
    daemonState: {},
    running: false,
    heartbeatInterval: null,
    supervisionInterval: null,
    createAdapter,
    ensureRestartState: vi.fn(),
    syncPlatformStateFromHealth: vi.fn(),
    pushTrace: vi.fn(),
    observeAdapter: vi.fn(),
    writeRuntimeStatus: vi.fn(),
    snapshotState: vi.fn().mockResolvedValue({}),
    runHeartbeat: vi.fn().mockResolvedValue({}),
    runWatchdog: vi.fn().mockResolvedValue([]),
  } as unknown as GatewayRunnerLifecycleHost;
  const control = createGatewayRunnerControlPlane({
    lifecycle: {},
    supervision: {},
    buildLifecycleHost: () => host,
  } as unknown as GatewayRunnerControlPlaneDependencies);
  return { control, host, starting, active, createAdapter };
}

function expectStopped(gateway: ReturnType<typeof createGateway>) {
  expect(gateway.host.running).toBe(false);
  expect(gateway.active.size).toBe(0);
  expect(gateway.host.adapters.size).toBe(0);
  expect(gateway.host.heartbeatInterval).toBeNull();
  expect(gateway.host.supervisionInterval).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
}

it("shares overlapping starts without creating duplicate adapters", async () => {
  const gateway = createGateway();
  const first = gateway.control.start();
  const second = gateway.control.start();
  await vi.advanceTimersByTimeAsync(0);
  gateway.starting.resolve();
  await Promise.all([first, second]);

  expect(gateway.createAdapter).toHaveBeenCalledTimes(1);
  expect(first).toBe(second);
  expect(gateway.active.size).toBe(1);
  expect(gateway.host.running).toBe(true);
  expect(vi.getTimerCount()).toBe(2);
  await gateway.control.stop();
  expectStopped(gateway);
});

it("waits for adapter startup before stopping all adapters and intervals", async () => {
  const gateway = createGateway();
  const started = gateway.control.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(gateway.createAdapter).toHaveBeenCalledTimes(1);
  const stopped = gateway.control.stop();
  await vi.advanceTimersByTimeAsync(0);
  gateway.starting.resolve();
  await Promise.all([started, stopped]);

  expectStopped(gateway);

  await gateway.control.start();
  expect(gateway.host.running).toBe(true);
  expect(gateway.createAdapter).toHaveBeenCalledTimes(2);
  expect(gateway.active.size).toBe(1);
  expect(vi.getTimerCount()).toBe(2);
  await gateway.control.stop();
  expectStopped(gateway);
});

it("preserves a start requested after a queued stop", async () => {
  const gateway = createGateway();
  const first = gateway.control.start();
  const stopped = gateway.control.stop();
  const restarted = gateway.control.start();
  gateway.starting.resolve();
  await Promise.all([first, stopped, restarted]);

  expect(gateway.createAdapter).toHaveBeenCalledTimes(2);
  expect(
    gateway.createAdapter.mock.results[0].value.stop,
  ).toHaveBeenCalledOnce();
  expect(gateway.host.running).toBe(true);
  expect(gateway.active.size).toBe(1);
  expect(vi.getTimerCount()).toBe(2);
  await gateway.control.stop();
  expectStopped(gateway);
});

it("still stops after an in-progress startup rejects", async () => {
  const gateway = createGateway();
  vi.spyOn(gateway.host, "runHeartbeat").mockRejectedValueOnce(
    new Error("startup heartbeat failed"),
  );
  const started = gateway.control.start();
  const rejection = expect(started).rejects.toThrow("startup heartbeat failed");
  const stopped = gateway.control.stop();
  gateway.starting.resolve();
  await rejection;
  await stopped;

  expectStopped(gateway);
  await gateway.control.start();
  expect(gateway.host.running).toBe(true);
  await gateway.control.stop();
  expectStopped(gateway);
});

it("keeps separate gateway lifecycle queues independent", async () => {
  const first = createGateway();
  const second = createGateway();
  const pending = first.control.start();
  second.starting.resolve();
  await second.control.start();
  expect(first.host.running).toBe(false);
  expect(second.host.running).toBe(true);
  await second.control.stop();
  first.starting.resolve();
  await pending;
  await first.control.stop();
  expectStopped(first);
  expectStopped(second);
});
