import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayHistoryFilter } from "@/gateway/read/history-view";
import type { GatewayRuntimeStatus } from "@/gateway/read/read-model";

type CapturedAssemblyOptions = {
  runHeartbeat: (reason?: string) => Promise<unknown>;
  runWatchdog: (reason?: string) => Promise<unknown>;
  snapshotState: (
    reason: string,
    limit?: number,
    filters?: GatewayHistoryFilter,
  ) => Promise<unknown>;
  getRuntimeStatus: () => GatewayRuntimeStatus;
};

async function loadWireModule() {
  return (await import("./wire")) as typeof import("./wire");
}

describe("createLazyApiGuard", () => {
  it("throws before the value is resolved", async () => {
    const { createLazyApiGuard } = await loadWireModule();
    const guard = createLazyApiGuard<{ ping: () => string }>("TestApi");
    expect(() => guard.require()).toThrow(
      "TestApi was accessed before it was resolved.",
    );
  });

  it("returns the value after it is resolved", async () => {
    const { createLazyApiGuard } = await loadWireModule();
    const guard = createLazyApiGuard<{ ping: () => string }>("TestApi");
    const value = { ping: () => "pong" };
    guard.resolve(value);
    expect(guard.require()).toBe(value);
    expect(guard.require().ping()).toBe("pong");
  });

  it("includes the label in the error message", async () => {
    const { createLazyApiGuard } = await loadWireModule();
    const guard = createLazyApiGuard<string>("MyComponent");
    expect(() => guard.require()).toThrow("MyComponent");
  });

  it("callbacks captured before resolve work correctly after resolve", async () => {
    const { createLazyApiGuard } = await loadWireModule();
    const guard = createLazyApiGuard<{ getValue: () => number }>("Deferred");
    const deferredGet = () => guard.require().getValue();

    guard.resolve({ getValue: () => 42 });

    expect(deferredGet()).toBe(42);
  });
});

describe("wireGatewayRunnerRuntime", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("routes deferred assembly callbacks through the resolved runtime api", async () => {
    let capturedAssemblyOptions: CapturedAssemblyOptions | undefined;
    const heartbeatResult = { source: "heartbeat-api" } as never;
    const watchdogResult = [{ source: "watchdog-api" }] as never;
    const snapshotResult = { source: "snapshot-api" } as never;
    const runtimeStatus = {
      status: "healthy",
    } as unknown as GatewayRuntimeStatus;
    const controlPlane = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      heartbeat: vi.fn(async (_reason?: string) => heartbeatResult),
      supervise: vi.fn(async () => [] as never),
      watchdog: vi.fn(async (_reason?: string) => watchdogResult),
      watch: vi.fn(async () => [] as never),
      restart: vi.fn(async () => [] as never),
    };
    const stateBookkeeping = {
      snapshotState: vi.fn(
        async (
          _reason: string,
          _limit?: number,
          _filters?: GatewayHistoryFilter,
        ) => snapshotResult,
      ),
    };
    const readModel = {
      runtimeStatus: vi.fn(() => runtimeStatus),
      transport: vi.fn(async () => ({ platform: "discord" }) as never),
      transportOverview: vi.fn(async () => ({
        details: [],
        mismatchCount: 0,
        operationalCount: 0,
      })),
      health: vi.fn(async () => [] as never),
      trace: vi.fn(() => [] as never),
      state: vi.fn(async () => ({}) as never),
      history: vi.fn(async () => ({}) as never),
      inbox: vi.fn(() => [] as never),
      outbox: vi.fn(() => [] as never),
      attachments: vi.fn(() => [] as never),
      supervision: vi.fn(() => [] as never),
      replayInbox: vi.fn(async () => ({}) as never),
    };
    const assembled = {
      controlPlane,
      readModel,
      recording: {
        onUpdate: vi.fn(() => () => {}),
      },
      operations: {
        receive: vi.fn(async () => ({}) as never),
        sendToHomes: vi.fn(async () => [] as never),
        editDelivery: vi.fn(async () => ({}) as never),
        sendProgressive: vi.fn(async () => ({}) as never),
      },
      stateBookkeeping,
    };

    vi.doMock("./assembly", () => ({
      assembleGatewayRunnerRuntime: (options: unknown) => {
        capturedAssemblyOptions = options as CapturedAssemblyOptions;
        return assembled as never;
      },
    }));

    const context = {
      config: { id: "config" },
      runtime: { id: "runtime" },
      services: { gatewayConfig: { id: "gateway-config" } },
    } as never;
    const state = { id: "state" } as never;

    try {
      const { wireGatewayRunnerRuntime } = await loadWireModule();

      const api = wireGatewayRunnerRuntime(context, state);
      expect(api.control.heartbeat).toBeDefined();
      expect(api.recording.snapshotState).toBeDefined();

      if (!capturedAssemblyOptions) {
        throw new Error("Expected assembly options to be captured.");
      }

      const filters = {
        platforms: ["discord"],
      } as unknown as GatewayHistoryFilter;

      expect(controlPlane.heartbeat).not.toHaveBeenCalled();
      await expect(
        capturedAssemblyOptions.runHeartbeat("manual-heartbeat"),
      ).resolves.toBe(heartbeatResult);
      expect(controlPlane.heartbeat).toHaveBeenCalledWith("manual-heartbeat");

      expect(controlPlane.watchdog).not.toHaveBeenCalled();
      await expect(
        capturedAssemblyOptions.runWatchdog("manual-watchdog"),
      ).resolves.toBe(watchdogResult);
      expect(controlPlane.watchdog).toHaveBeenCalledWith("manual-watchdog");

      expect(stateBookkeeping.snapshotState).not.toHaveBeenCalled();
      await expect(
        capturedAssemblyOptions.snapshotState("manual-snapshot", 7, filters),
      ).resolves.toBe(snapshotResult);
      expect(stateBookkeeping.snapshotState).toHaveBeenCalledWith(
        "manual-snapshot",
        7,
        filters,
      );

      expect(readModel.runtimeStatus).not.toHaveBeenCalled();
      expect(capturedAssemblyOptions.getRuntimeStatus()).toBe(runtimeStatus);
      expect(readModel.runtimeStatus).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
      vi.resetModules();
      vi.clearAllMocks();
    }
  });
});
