import { describe, expect, it, mock } from "bun:test";
import type { PlatformHealth } from "@/gateway/platforms/base";
import type { GatewayHistoryFilter } from "@/gateway/read/history-view";
import type { GatewayRuntimeStatus } from "@/gateway/read/read-model";
import type { GatewayReceiveResult } from "@/gateway/receive/index";
import type {
  GatewayHistorySnapshot,
  GatewayStateSnapshot,
  GatewayTransportDetail,
} from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
} from "@/types/gateway";
import type { GatewayRunnerRuntimeApi } from "./service-runtime/api";

describe("GatewayRunner", () => {
  it("delegates control, delivery, and read API methods to the runtime wiring", async () => {
    const runtimeStatus: GatewayRuntimeStatus = {
      pid: 1,
      running: true,
      updatedAt: "2026-04-01T10:00:00.000Z",
      supervisionEvents: 0,
      adapters: ["api"],
      daemon: {
        policy: {
          heartbeatIntervalMs: 60_000,
          watchdogIntervalMs: 45_000,
          restartBaseDelayMs: 5_000,
          restartMaxDelayMs: 300_000,
          restartMultiplier: 2,
          restartJitterMs: 750,
        },
        state: {
          heartbeatRuns: 0,
          watchdogRuns: 0,
          restartRuns: 0,
          restartRecoveries: 0,
          restartBackoffs: 0,
          watchdogSkips: 0,
        },
        restartQueue: [],
        watchdog: {
          running: true,
          activePlatforms: 1,
          unhealthyPlatforms: 0,
          restartablePlatforms: 1,
          backoffPlatforms: 0,
        },
      },
      journalPaths: {
        snapshot: "snapshot.json",
        history: "history.json",
        runtime: "runtime.json",
        supervision: "supervision.json",
        inbox: "inbox.json",
        outbox: "outbox.json",
        attachments: "attachments.json",
      },
      transportControl: {
        configured: 1,
        enabledPlugins: 1,
        gatewayEnabled: 1,
        availableServices: 1,
        liveServices: 1,
        officialPlugins: 0,
        vendoredPlugins: 0,
        operationalTransports: 1,
        customTransports: 0,
        productTransports: 0,
      },
      messagingBridge: [],
      transportInventory: [],
    };
    const context = {
      config: {},
      services: { gatewayConfig: {} },
      runtime: {},
    } as never;

    const runtime = {
      control: {
        start: mock(async () => undefined),
        stop: mock(async () => undefined),
        heartbeat: mock(async () => ({}) as never as GatewayStateSnapshot),
        supervise: mock(async () => [] as GatewaySupervisionRecord[]),
        watchdog: mock(async () => [] as GatewaySupervisionRecord[]),
        watch: mock(async () => [] as GatewaySupervisionRecord[]),
        restart: mock(async () => [] as GatewaySupervisionRecord[]),
      },
      delivery: {
        receive: mock(async () => ({ ok: true }) as GatewayReceiveResult),
        sendToHomes: mock(async () => [] as DeliveredMessageRecord[]),
        editDelivery: mock(
          async () => ({ id: "d-1" }) as DeliveredMessageRecord,
        ),
        sendProgressive: mock(
          async () => ({ id: "d-2" }) as DeliveredMessageRecord,
        ),
      },
      read: {
        runtimeStatus: mock(() => runtimeStatus),
        transport: mock(
          async (_platform) => ({ platform: "api" }) as GatewayTransportDetail,
        ),
        transportOverview: mock(async () => ({
          details: [] as GatewayTransportDetail[],
          mismatchCount: 0,
          operationalCount: 0,
        })),
        health: mock(async () => [] as PlatformHealth[]),
        trace: mock((_limit?: number, _filters?: GatewayHistoryFilter) => []),
        state: mock(async () => ({}) as never as GatewayStateSnapshot),
        history: mock(async () => ({}) as never as GatewayHistorySnapshot),
        inbox: mock((_limit?: number, _filters?: GatewayHistoryFilter) => []),
        outbox: mock((_limit?: number, _filters?: GatewayHistoryFilter) => []),
        attachments: mock(
          (_limit?: number, _filters?: GatewayHistoryFilter) => [],
        ),
        supervision: mock(
          (_limit?: number) => [] as GatewaySupervisionRecord[],
        ),
        replayInbox: mock(async () => ({}) as never),
      },
      recording: {
        snapshotState: mock(
          async (
            _reason: string,
            _limit?: number,
            _filters?: GatewayHistoryFilter,
          ) => ({}) as GatewayHistorySnapshot,
        ),
        onUpdate: mock(() => mock(() => undefined)),
      },
    } satisfies GatewayRunnerRuntimeApi;

    mock.module("./service-runtime/wire", () => ({
      wireGatewayRunnerRuntime: () => runtime,
    }));

    try {
      const { GatewayRunner } = await import(
        `./service?runner-service-delegation=${Date.now()}`
      );
      const runner = new GatewayRunner(context);
      const message = {
        platform: "api",
        roomId: "room-1",
        userId: "user-1",
      } as IncomingPlatformMessage;

      await runner.start();
      await runner.stop();
      await runner.heartbeat("manual");
      await runner.runtimeStatus();
      await runner.transport("api");
      await runner.transportOverview();
      await runner.supervise("manual");
      await runner.watchdog("watchdog");
      await runner.watch("api", "manual");
      await runner.restart("api", "manual");
      await runner.receive(message, {});
      await runner.sendToHomes("hello");
      await runner.editDelivery("d-1", "edited");
      await runner.sendProgressive(
        {
          platform: "api",
          roomId: "room-1",
          userId: "user-1",
          mode: "home",
        },
        ["one", "two"],
      );
      await runner.health();
      await runner.state();
      await runner.history();
      runner.inbox();
      runner.outbox();
      runner.attachments();
      runner.supervision();
      await runner.replayInbox("i-1");
      const detach = runner.onUpdate(() => {});

      expect(runtime.control.start).toHaveBeenCalledTimes(1);
      expect(runtime.control.stop).toHaveBeenCalledTimes(1);
      expect(runtime.control.heartbeat).toHaveBeenCalledWith("manual");
      expect(runtime.control.watch).toHaveBeenCalledWith("api", "manual");
      expect(runtime.control.restart).toHaveBeenCalledWith("api", "manual");
      expect(runtime.read.runtimeStatus).toHaveBeenCalledTimes(1);
      expect(runtime.read.transport).toHaveBeenCalledWith("api");
      expect(runtime.delivery.receive).toHaveBeenCalledWith(message, {});
      expect(runtime.delivery.sendToHomes).toHaveBeenCalledWith(
        "hello",
        undefined,
      );
      expect(detach).toBeTypeOf("function");
      expect(typeof detach).toBe("function");
    } finally {
      mock.restore();
      mock.clearAllMocks();
    }
  });

  it("propagates delivery failures from the runtime api", async () => {
    const runtimeStatus: GatewayRuntimeStatus = {
      pid: 1,
      running: true,
      updatedAt: "2026-04-01T10:00:00.000Z",
      supervisionEvents: 0,
      adapters: ["api"],
      daemon: {
        policy: {
          heartbeatIntervalMs: 60_000,
          watchdogIntervalMs: 45_000,
          restartBaseDelayMs: 5_000,
          restartMaxDelayMs: 300_000,
          restartMultiplier: 2,
          restartJitterMs: 750,
        },
        state: {
          heartbeatRuns: 0,
          watchdogRuns: 0,
          restartRuns: 0,
          restartRecoveries: 0,
          restartBackoffs: 0,
          watchdogSkips: 0,
        },
        restartQueue: [],
        watchdog: {
          running: true,
          activePlatforms: 1,
          unhealthyPlatforms: 0,
          restartablePlatforms: 1,
          backoffPlatforms: 0,
        },
      },
      journalPaths: {
        snapshot: "snapshot.json",
        history: "history.json",
        runtime: "runtime.json",
        supervision: "supervision.json",
        inbox: "inbox.json",
        outbox: "outbox.json",
        attachments: "attachments.json",
      },
      transportControl: {
        configured: 1,
        enabledPlugins: 1,
        gatewayEnabled: 1,
        availableServices: 1,
        liveServices: 1,
        officialPlugins: 0,
        vendoredPlugins: 0,
        operationalTransports: 1,
        customTransports: 0,
        productTransports: 0,
      },
      messagingBridge: [],
      transportInventory: [],
    };
    const runtime = {
      control: {
        start: mock(async () => undefined),
        stop: mock(async () => undefined),
        heartbeat: mock(async () => ({}) as never as GatewayStateSnapshot),
        supervise: mock(async () => [] as GatewaySupervisionRecord[]),
        watchdog: mock(async () => [] as GatewaySupervisionRecord[]),
        watch: mock(async () => [] as GatewaySupervisionRecord[]),
        restart: mock(async () => [] as GatewaySupervisionRecord[]),
      },
      delivery: {
        receive: mock(async () => {
          throw new Error("gateway receive failed");
        }),
        sendToHomes: mock(async () => [] as DeliveredMessageRecord[]),
        editDelivery: mock(
          async () => ({ id: "d-1" }) as DeliveredMessageRecord,
        ),
        sendProgressive: mock(
          async () => ({ id: "d-2" }) as DeliveredMessageRecord,
        ),
      },
      read: {
        runtimeStatus: mock(() => runtimeStatus),
        transport: mock(
          async () => ({ platform: "api" }) as GatewayTransportDetail,
        ),
        transportOverview: mock(async () => ({
          details: [] as GatewayTransportDetail[],
          mismatchCount: 0,
          operationalCount: 0,
        })),
        health: mock(async () => [] as PlatformHealth[]),
        trace: mock(() => []),
        state: mock(async () => ({}) as never as GatewayStateSnapshot),
        history: mock(async () => ({}) as never as GatewayHistorySnapshot),
        inbox: mock(() => []),
        outbox: mock(() => []),
        attachments: mock(() => []),
        supervision: mock(() => [] as GatewaySupervisionRecord[]),
        replayInbox: mock(async () => ({}) as never),
      },
      recording: {
        snapshotState: mock(
          async (
            _reason: string,
            _limit?: number,
            _filters?: GatewayHistoryFilter,
          ) => ({}) as GatewayHistorySnapshot,
        ),
        onUpdate: mock(() => () => undefined),
      },
    } satisfies GatewayRunnerRuntimeApi;

    mock.module("./service-runtime/wire", () => ({
      wireGatewayRunnerRuntime: () => runtime,
    }));

    try {
      const { GatewayRunner } = await import(
        `./service?runner-service-failure=${Date.now()}`
      );
      const runner = new GatewayRunner({} as never);

      await expect(
        runner.receive({ platform: "api", roomId: "room-1", userId: "user-1" }),
      ).rejects.toThrow("gateway receive failed");
    } finally {
      mock.restore();
      mock.clearAllMocks();
    }
  });
});
