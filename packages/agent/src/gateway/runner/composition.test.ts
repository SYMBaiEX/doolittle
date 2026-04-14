import { describe, expect, it } from "bun:test";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "@/gateway/read/history-view";
import type { GatewayRunnerBootstrapInputs } from "@/gateway/runner/bootstrap";
import { composeGatewayRunnerRuntime } from "@/gateway/runner/composition/compose";
import type {
  GatewayRunnerRuntimeAssemblyFactories,
  GatewayRunnerRuntimeAssemblyInput,
} from "@/gateway/runner/composition/types";
import type {
  GatewayRunnerControlPlane,
  GatewayRunnerControlPlaneDependencies,
} from "@/gateway/runner/control-plane";
import type { GatewayRunnerOperations } from "@/gateway/runner/operations";
import type { GatewayHistorySnapshot } from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type { PlatformName } from "@/types/gateway";

describe("composeGatewayRunnerRuntime", () => {
  it("wires bootstrap receive callback to the created operations", async () => {
    let capturedReadPlaneArgs: GatewayRunnerBootstrapInputs | undefined;
    let capturedReadPlaneSnapshotPath = "";
    let operationsReceiveCalled = false;

    const fakeState = {
      reason: "heartbeat",
      updatedAt: "2026-04-01T00:00:00.000Z",
      state: {
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
      snapshotPath: "/tmp/snapshot.json",
      historyPath: "/tmp/history.jsonl",
      readiness: [],
      transportOverview: {
        mismatchCount: 0,
        operationalCount: 0,
        details: [],
      },
      transportSummaries: [],
      transportJournal: [],
      traces: [],
      inbox: [],
      outbox: [],
      attachments: [],
      deliveries: [],
      sessions: [],
    } as unknown as GatewayHistorySnapshot;

    const baseState: GatewayRunnerRuntimeAssemblyInput = {
      context: {
        config: { gatewayDataDir: "/tmp/gateway" } as never,
        services: {
          gatewayConfig: { platforms: {} } as never,
        } as never,
        runtime: {} as never,
      } as never,
      adapters: new Map(),
      platformStates: new Map(),
      daemonState: {
        heartbeatRuns: 0,
        watchdogRuns: 0,
        restartRuns: 0,
        restartRecoveries: 0,
        restartBackoffs: 0,
        watchdogSkips: 0,
      },
      restartBackoffByPlatform: new Map(),
      resolveNativeMessagingPlugin: () => undefined,
      getConfiguredPlatforms: () => ["api"] as PlatformName[],
      isPlatformEnabled: () => true,
      getTransportControlPlane: () =>
        ({
          totals: {
            configuredPlatforms: 1,
            activeAdapters: 0,
            readyAdapters: 0,
            gatewayEnabledTransports: 1,
            operationalTransports: 1,
            nativeAdapters: 0,
            mockAdapters: 0,
            pluginMediatedAdapters: 0,
            officialPluginAdapters: 0,
            vendoredPluginAdapters: 0,
          },
          transportInventory: [],
          messagingBridge: [],
        }) as never,
      isRunning: () => false,
      getWatchdogAt: () => undefined,
      getRuntimeMeta: () => ({
        pid: 321,
        running: false,
        updatedAt: "2026-04-01T00:00:00.000Z",
        adapterPlatforms: ["api"],
      }),
      getNativeMessagingState: () => undefined,
      setRunning: () => {},
      getStartedAt: () => undefined,
      setStartedAt: () => {},
      getStoppedAt: () => undefined,
      setStoppedAt: () => {},
      getLastHeartbeatAt: () => undefined,
      setLastHeartbeatAt: () => {},
      getHeartbeatInterval: () => null,
      setHeartbeatInterval: () => {},
      getSupervisionInterval: () => null,
      setSupervisionInterval: () => {},
      createAdapter: () => ({}) as never,
      runHeartbeat: async () => fakeState as never,
      runWatchdog: async () => [] as GatewaySupervisionRecord[],
      observeAdapter: async () => {},
      snapshotState: async () => fakeState,
      setLastSupervisionAt: () => {},
      getOutboxSessionIdByDeliveryId: () => undefined,
      getRuntimeStatus: () =>
        ({
          pid: 321,
          running: false,
          updatedAt: "2026-04-01T00:00:00.000Z",
          supervisionEvents: 0,
          adapters: ["api"],
          daemon: {
            policy: {
              heartbeatIntervalMs: 0,
              watchdogIntervalMs: 0,
              restartBaseDelayMs: 0,
              restartMaxDelayMs: 0,
              restartMultiplier: 1,
              restartJitterMs: 0,
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
              running: false,
              activePlatforms: 0,
              unhealthyPlatforms: 0,
              restartablePlatforms: 0,
              backoffPlatforms: 0,
            },
          },
          journalPaths: {
            snapshot: "/tmp/snapshot.json",
            history: "/tmp/history.jsonl",
            runtime: "/tmp/runtime.json",
            supervision: "/tmp/supervision.json",
            inbox: "/tmp/inbox.jsonl",
            outbox: "/tmp/outbox.jsonl",
            attachments: "/tmp/attachments.jsonl",
          },
          transportControl: {
            configuredPlatforms: 1,
            activeAdapters: 0,
            readyAdapters: 0,
            gatewayEnabledTransports: 1,
            operationalTransports: 1,
            nativeAdapters: 0,
            mockAdapters: 0,
            pluginMediatedAdapters: 0,
            officialPluginAdapters: 0,
            vendoredPluginAdapters: 0,
          },
          messagingBridge: [],
          transportInventory: [],
        }) as never,
    };

    const factories: GatewayRunnerRuntimeAssemblyFactories = {
      buildReadPlane: (readPlaneParams) => {
        capturedReadPlaneArgs = readPlaneParams;
        capturedReadPlaneSnapshotPath =
          readPlaneParams.getSnapshotStatePaths().snapshotPath;
        return {
          snapshotPath: "/tmp/snapshot.json",
          snapshotHistoryPath: "/tmp/history.jsonl",
          runtimeStatusPath: "/tmp/runtime.json",
          supervisionPath: "/tmp/supervision.json",
          inboxPath: "/tmp/inbox.jsonl",
          outboxPath: "/tmp/outbox.jsonl",
          attachmentsPath: "/tmp/attachments.jsonl",
          traceLog: [] as GatewayTraceRecord[],
          inboxLog: [] as GatewayInboxRecord[],
          outboxLog: [] as GatewayOutboxRecord[],
          attachmentLog: [] as GatewayAttachmentRecord[],
          supervisionLog: [] as GatewaySupervisionRecord[],
          stateBookkeeping: {
            ensureRestartState: () => ({}) as never,
            ensurePlatformState: () => ({}) as never,
            syncPlatformStateFromHealth: () => ({}) as never,
            updatePlatformStateFromTrace: () => {},
          } as never,
          readModel: {} as never,
        };
      },
      buildOperations: () => {
        return {
          observeAdapter: async () => {},
          receive: async () => {
            operationsReceiveCalled = true;
            return {
              ok: true,
              response: "mock",
              traceId: "trace",
              sessionId: "session",
              deliveryId: "delivery",
              runSessionId: "run-session",
            } as never;
          },
          sendToHomes: async () => [],
          editDelivery: async () => ({}) as never,
          sendProgressive: async () => ({}) as never,
        } as GatewayRunnerOperations;
      },
      buildControlPlane: (
        controlPlaneParams: GatewayRunnerControlPlaneDependencies,
      ): GatewayRunnerControlPlane => {
        expect(controlPlaneParams.lifecycle.runHeartbeat).toBe(
          baseState.runHeartbeat,
        );
        expect(controlPlaneParams.lifecycle.runWatchdog).toBe(
          baseState.runWatchdog,
        );
        return {
          start: async () => {},
          stop: async () => {},
          heartbeat: async () => fakeState as never,
          supervise: async () => [],
          watchdog: async () => [],
          watch: async () => [],
          restart: async () => [],
        };
      },
    };

    const result = composeGatewayRunnerRuntime({
      ...baseState,
      ...factories,
    });

    if (!capturedReadPlaneArgs) {
      throw new Error("Expected bootstrap args to be captured.");
    }

    await capturedReadPlaneArgs.receive(
      {
        platform: "api",
        messageId: "m-1",
        roomId: "room",
        userId: "user",
        text: "ping",
      } as never,
      {},
    );

    expect(operationsReceiveCalled).toBe(true);
    expect(capturedReadPlaneSnapshotPath).toBe("");
    expect(capturedReadPlaneArgs.getSnapshotStatePaths().snapshotPath).toBe(
      "/tmp/snapshot.json",
    );
    expect(result.snapshotPath).toBe("/tmp/snapshot.json");
    expect(result.snapshotHistoryPath).toBe("/tmp/history.jsonl");
  });
});
