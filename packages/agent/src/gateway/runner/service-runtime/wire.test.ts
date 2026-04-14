import { describe, expect, it, mock } from "bun:test";
import type { GatewayHistoryFilter } from "@/gateway/read/history-view";
import type { GatewayRuntimeStatus } from "@/gateway/read/read-model";
import { createLazyApiGuard } from "@/gateway/runner/service-runtime/wire";

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

describe("createLazyApiGuard", () => {
  it("throws before the value is resolved", () => {
    const guard = createLazyApiGuard<{ ping: () => string }>("TestApi");
    expect(() => guard.require()).toThrow(
      "TestApi was accessed before it was resolved.",
    );
  });

  it("returns the value after it is resolved", () => {
    const guard = createLazyApiGuard<{ ping: () => string }>("TestApi");
    const value = { ping: () => "pong" };
    guard.resolve(value);
    expect(guard.require()).toBe(value);
    expect(guard.require().ping()).toBe("pong");
  });

  it("includes the label in the error message", () => {
    const guard = createLazyApiGuard<string>("MyComponent");
    expect(() => guard.require()).toThrow("MyComponent");
  });

  it("callbacks captured before resolve work correctly after resolve", () => {
    const guard = createLazyApiGuard<{ getValue: () => number }>("Deferred");
    const deferredGet = () => guard.require().getValue();

    guard.resolve({ getValue: () => 42 });

    expect(deferredGet()).toBe(42);
  });
});

describe("wireGatewayRunnerRuntime", () => {
  it("routes deferred assembly callbacks through the resolved runtime api", async () => {
    let capturedAssemblyOptions: CapturedAssemblyOptions | undefined;
    const heartbeatResult = { source: "heartbeat-api" } as never;
    const watchdogResult = [{ source: "watchdog-api" }] as never;
    const snapshotResult = { source: "snapshot-api" } as never;
    const runtimeStatus = {
      status: "healthy",
    } as unknown as GatewayRuntimeStatus;
    const controlPlane = {
      start: mock(async () => undefined),
      stop: mock(async () => undefined),
      heartbeat: mock(async (_reason?: string) => heartbeatResult),
      supervise: mock(async () => [] as never),
      watchdog: mock(async (_reason?: string) => watchdogResult),
      watch: mock(async () => [] as never),
      restart: mock(async () => [] as never),
    };
    const stateBookkeeping = {
      snapshotState: mock(
        async (
          _reason: string,
          _limit?: number,
          _filters?: GatewayHistoryFilter,
        ) => snapshotResult,
      ),
    };
    const readModel = {
      runtimeStatus: mock(() => runtimeStatus),
      transport: mock(async () => ({ platform: "discord" }) as never),
      transportOverview: mock(async () => ({
        details: [],
        mismatchCount: 0,
        operationalCount: 0,
      })),
      health: mock(async () => [] as never),
      trace: mock(() => [] as never),
      state: mock(async () => ({}) as never),
      history: mock(async () => ({}) as never),
      inbox: mock(() => [] as never),
      outbox: mock(() => [] as never),
      attachments: mock(() => [] as never),
      supervision: mock(() => [] as never),
      replayInbox: mock(async () => ({}) as never),
    };
    const assembled = {
      controlPlane,
      readModel,
      recording: {
        onUpdate: mock(() => () => {}),
      },
      operations: {
        receive: mock(async () => ({}) as never),
        sendToHomes: mock(async () => [] as never),
        editDelivery: mock(async () => ({}) as never),
        sendProgressive: mock(async () => ({}) as never),
      },
      stateBookkeeping,
    };

    mock.module("./assembly", () => ({
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
      const { wireGatewayRunnerRuntime } = await import(
        `./wire?wire-runtime-test=${Date.now()}`
      );

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
      mock.restore();
      mock.clearAllMocks();
    }
  });
});
