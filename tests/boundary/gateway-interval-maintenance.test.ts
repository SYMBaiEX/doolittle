import { afterEach, expect, it, vi } from "vitest";
import { GATEWAY_DAEMON_POLICY } from "../../packages/agent/src/gateway/daemon-state";
import { startGatewayRunnerLifecycle } from "../../packages/agent/src/gateway/runner/lifecycle/startup";
import type { GatewayRunnerLifecycleHost } from "../../packages/agent/src/gateway/runner/lifecycle/types";
import { createDeferred } from "../support/deferred";

vi.mock("../../packages/agent/src/config/gateway", () => ({
  loadGatewayConfig: () => ({ platforms: {} }),
}));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function startGateway() {
  vi.useFakeTimers();
  const error = vi.fn();
  const heartbeat = vi.fn().mockResolvedValue(undefined);
  const watchdog = vi.fn().mockResolvedValue([]);
  const host = {
    context: {
      config: {},
      services: { logger: { error }, hooks: { emit: vi.fn() } },
    },
    adapters: new Map(),
    daemonState: {},
    running: false,
    heartbeatInterval: null,
    supervisionInterval: null,
    writeRuntimeStatus: vi.fn(),
    runHeartbeat: heartbeat,
    runWatchdog: watchdog,
  } as unknown as GatewayRunnerLifecycleHost;
  await startGatewayRunnerLifecycle(host);
  expect(heartbeat).toHaveBeenCalledWith("startup");
  expect(watchdog).toHaveBeenCalledWith("startup");
  heartbeat.mockClear();
  watchdog.mockClear();
  return { host, error, heartbeat, watchdog };
}

const jobs = [
  ["heartbeat", GATEWAY_DAEMON_POLICY.heartbeatIntervalMs],
  ["watchdog", GATEWAY_DAEMON_POLICY.watchdogIntervalMs],
] as const;

it.each(jobs)(
  "contains and logs a rejecting %s tick, then retries",
  async (job, intervalMs) => {
    const gateway = await startGateway();
    gateway[job].mockRejectedValueOnce(new Error("maintenance unavailable"));

    await vi.advanceTimersByTimeAsync(intervalMs);

    expect(gateway.error).toHaveBeenCalledExactlyOnceWith(
      "gateway-interval-failed",
      { job, detail: expect.stringContaining("maintenance unavailable") },
    );
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(gateway[job]).toHaveBeenCalledTimes(2);
    expect(gateway.error).toHaveBeenCalledTimes(1);
  },
);

it.each(jobs)(
  "contains a synchronous %s tick failure",
  async (job, intervalMs) => {
    const gateway = await startGateway();
    gateway[job].mockImplementationOnce(() => {
      throw new Error("synchronous maintenance failure");
    });

    await vi.advanceTimersByTimeAsync(intervalMs);

    expect(gateway.error).toHaveBeenCalledExactlyOnceWith(
      "gateway-interval-failed",
      {
        job,
        detail: expect.stringContaining("synchronous maintenance failure"),
      },
    );
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(gateway[job]).toHaveBeenCalledTimes(2);
  },
);

it("skips overlapping ticks independently and resumes after completion", async () => {
  const gateway = await startGateway();
  const heartbeat = createDeferred<void>();
  const watchdog = createDeferred<void>();
  gateway.heartbeat.mockReturnValueOnce(heartbeat.promise);
  gateway.watchdog.mockReturnValueOnce(watchdog.promise);

  await vi.advanceTimersByTimeAsync(180_000);
  expect(gateway.heartbeat).toHaveBeenCalledExactlyOnceWith("interval");
  expect(gateway.watchdog).toHaveBeenCalledExactlyOnceWith("interval");

  watchdog.resolve();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(gateway.watchdog).toHaveBeenCalledTimes(2);
  expect(gateway.heartbeat).toHaveBeenCalledTimes(1);

  heartbeat.resolve();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(gateway.heartbeat).toHaveBeenCalledTimes(2);
  expect(gateway.error).not.toHaveBeenCalled();
});

it("does not create more intervals when the gateway is already running", async () => {
  const { host } = await startGateway();
  expect(vi.getTimerCount()).toBe(2);
  await startGatewayRunnerLifecycle(host);
  expect(vi.getTimerCount()).toBe(2);
});
