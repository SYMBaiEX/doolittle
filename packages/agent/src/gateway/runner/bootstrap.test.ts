import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapGatewayRunnerReadPlane } from "@/gateway/runner/bootstrap";
import type { PlatformName } from "@/types/gateway";

interface GatewayRunnerBootstrapContextLike {
  config: {
    gatewayDataDir: string;
  };
  services: {
    delivery: {
      recent: () => [];
    };
    gatewaySessions: {
      list: () => [];
    };
  };
}

describe("bootstrapGatewayRunnerReadPlane", () => {
  it("initializes persistence, runtime bookkeeping, and read plane modules", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-bootstrap-"));

    try {
      const context = {
        config: {
          gatewayDataDir: join(root, "gateway"),
        },
        services: {
          delivery: {
            recent: () => [],
          },
          gatewaySessions: {
            list: () => [],
          },
        },
      } as GatewayRunnerBootstrapContextLike;

      const now = "2026-04-01T00:00:00.000Z";
      const result = bootstrapGatewayRunnerReadPlane({
        context: context as never,
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
        getWatchdogAt: () => now,
        getRuntimeMeta: () => ({
          pid: 1234,
          running: false,
          updatedAt: "2026-04-01T00:00:00.000Z",
          adapterPlatforms: [],
        }),
        getSnapshotStatePaths: () => {
          const snapshotPath = join(
            root,
            "gateway",
            "snapshots",
            "gateway-state.json",
          );
          const historyPath = join(
            root,
            "gateway",
            "snapshots",
            "gateway-state-history.jsonl",
          );
          return { snapshotPath, historyPath };
        },
        receive: async () => ({
          ok: true,
          response: "ok",
          traceId: "trace",
          sessionId: "session",
          deliveryId: "delivery",
          runSessionId: "session-run",
        }),
        getNativeMessagingState: () => undefined,
      });

      const status = result.readModel.runtimeStatus();
      const snapshotPath = join(
        root,
        "gateway",
        "snapshots",
        "gateway-state.json",
      );
      const runtimeStatusPath = join(
        root,
        "gateway",
        "snapshots",
        "gateway-runtime.json",
      );
      const historyPath = join(
        root,
        "gateway",
        "snapshots",
        "gateway-state-history.jsonl",
      );

      expect(result.snapshotPath).toBe(snapshotPath);
      expect(result.snapshotHistoryPath).toBe(historyPath);
      expect(result.runtimeStatusPath).toBe(runtimeStatusPath);
      expect(result.traceLog).toEqual([]);
      expect(result.inboxLog).toEqual([]);
      expect(result.outboxLog).toEqual([]);
      expect(result.attachmentLog).toEqual([]);
      expect(status.journalPaths.snapshot).toBe(snapshotPath);
      expect(status.journalPaths.runtime).toBe(runtimeStatusPath);

      const state = await result.readModel.state(5);
      expect(state.snapshotPath).toBe(snapshotPath);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("forwards snapshot persistence to bookkeeping path resolver", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-bootstrap-2-"));

    try {
      const context = {
        config: {
          gatewayDataDir: join(root, "gateway"),
        },
        services: {
          delivery: {
            recent: () => [],
          },
          gatewaySessions: {
            list: () => [],
          },
        },
      } as GatewayRunnerBootstrapContextLike;
      const now = "2026-04-01T00:00:00.000Z";

      const paths = {
        snapshotPath: join(root, "gateway", "snapshots", "gateway-state.json"),
        historyPath: join(
          root,
          "gateway",
          "snapshots",
          "gateway-state-history.jsonl",
        ),
      };

      const stateBookkeeping = bootstrapGatewayRunnerReadPlane({
        context: context as never,
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
        getConfiguredPlatforms: () => [],
        isPlatformEnabled: () => false,
        getTransportControlPlane: () =>
          ({
            totals: {
              configuredPlatforms: 0,
              activeAdapters: 0,
              readyAdapters: 0,
              gatewayEnabledTransports: 0,
              operationalTransports: 0,
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
          pid: 1234,
          running: false,
          updatedAt: now,
          adapterPlatforms: [],
        }),
        getSnapshotStatePaths: () => paths,
        receive: async () => ({
          ok: true,
          response: "ok",
          traceId: "trace",
          sessionId: "session",
          deliveryId: "delivery",
          runSessionId: "session-run",
        }),
        getNativeMessagingState: () => undefined,
      });

      const snapshot = await stateBookkeeping.stateBookkeeping.snapshotState(
        "manual",
        5,
      );

      expect(snapshot.snapshotPath).toBe(paths.snapshotPath);
      expect(snapshot.historyPath).toBe(paths.historyPath);
      expect(snapshot.reason).toBe("manual");
      expect(snapshot.state.reason).toBe("manual");
      expect(typeof snapshot.state.updatedAt).toBe("string");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
