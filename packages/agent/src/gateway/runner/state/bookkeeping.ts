import {
  buildGatewayDaemonRuntimeState,
  ensureGatewayRestartState,
  GATEWAY_DAEMON_POLICY,
  type GatewayDaemonRuntimeState,
  type GatewayRestartState,
} from "@/gateway/daemon-state";
import { nowIso, type PlatformHealth } from "@/gateway/platforms/base";
import type {
  GatewayHistoryFilter,
  GatewayTraceRecord,
} from "@/gateway/read/history-view";
import {
  collectGatewayReadiness,
  mergePlatformHealthState,
} from "@/gateway/read/status-readiness";
import {
  applyGatewayHealthToPlatformState,
  createGatewayPlatformState,
  type GatewayNativePluginInfo,
} from "@/gateway/state/platform-state";
import type {
  GatewayPlatformStateView,
  GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import { applyGatewayTraceToPlatformState } from "@/gateway/state/trace-state";
import type { PlatformName } from "@/types/gateway";
import { buildGatewayRunnerPresence } from "./projections";
import {
  buildGatewayRunnerHistorySnapshot,
  buildGatewayRunnerStateSnapshot,
} from "./snapshot";
import type {
  GatewayRunnerHistoryWindow,
  GatewayRunnerStateBookkeepingDeps,
} from "./types";

export class GatewayRunnerStateBookkeeping {
  constructor(private readonly deps: GatewayRunnerStateBookkeepingDeps) {}

  ensureRestartState(platform: PlatformName): GatewayRestartState {
    return ensureGatewayRestartState(
      this.deps.restartBackoffByPlatform,
      platform,
      GATEWAY_DAEMON_POLICY,
    );
  }

  buildDaemonRuntimeState(): GatewayDaemonRuntimeState {
    const activePlatforms = this.deps.adapters.size;
    const unhealthyPlatforms = Array.from(
      this.deps.platformStates.values(),
    ).filter((state) => state.status !== "running" || !state.ready).length;
    const backoffPlatforms = Array.from(
      this.deps.restartBackoffByPlatform.values(),
    ).filter((entry) => Boolean(entry.nextEligibleAt)).length;

    return buildGatewayDaemonRuntimeState({
      policy: GATEWAY_DAEMON_POLICY,
      state: this.deps.daemonState,
      restartBackoffByPlatform: this.deps.restartBackoffByPlatform,
      running: this.deps.isRunning(),
      activePlatforms,
      unhealthyPlatforms,
      backoffPlatforms,
    });
  }

  ensurePlatformState(platform: PlatformName): GatewayPlatformStateView {
    const existing = this.deps.platformStates.get(platform);
    if (existing) {
      return existing;
    }

    const created = createGatewayPlatformState(
      platform,
      this.deps.resolveNativeMessagingPlugin(platform) as
        | GatewayNativePluginInfo
        | undefined,
    ) as GatewayPlatformStateView;
    this.deps.platformStates.set(platform, created);
    return created;
  }

  syncPlatformStateFromHealth(
    health: PlatformHealth,
  ): GatewayPlatformStateView {
    const state = this.ensurePlatformState(health.platform);
    applyGatewayHealthToPlatformState({
      state,
      health,
      nativePlugin: this.deps.resolveNativeMessagingPlugin(health.platform),
      nowIso,
    });
    return state;
  }

  updatePlatformStateFromTrace(entry: GatewayTraceRecord): void {
    if (entry.platform === "gateway") {
      return;
    }

    const state = this.ensurePlatformState(entry.platform);
    applyGatewayTraceToPlatformState({
      state,
      entry,
      buildPresence: buildGatewayRunnerPresence,
    });
  }

  async collectReadiness(): Promise<PlatformHealth[]> {
    return collectGatewayReadiness({
      configuredPlatforms: this.deps.getConfiguredPlatforms(),
      getAdapterPlatforms: () => this.deps.adapters.keys(),
      getAdapterHealth: async (platform) => {
        const adapter = this.deps.adapters.get(platform);
        if (!adapter) {
          throw new Error(`Platform adapter for ${platform} is not available.`);
        }
        return adapter.health();
      },
      isPlatformEnabled: this.deps.isPlatformEnabled,
      syncPlatformStateFromHealth: this.syncPlatformStateFromHealth.bind(this),
      mergePlatformHealth: this.mergePlatformHealth.bind(this),
    });
  }

  mergePlatformHealth(health: PlatformHealth): PlatformHealth {
    return mergePlatformHealthState({
      health,
      getPlatformState: this.ensurePlatformState.bind(this),
      getTransportInventoryEntry: (platform) =>
        this.deps
          .getTransportControlPlane()
          .transportInventory.find((entry) => entry.platform === platform),
    });
  }

  buildStateSnapshot(
    readiness: PlatformHealth[],
    window: GatewayRunnerHistoryWindow,
    reason: string,
  ): GatewayStateSnapshot {
    return buildGatewayRunnerStateSnapshot({
      deps: this.deps,
      reason,
      readiness,
      daemon: this.buildDaemonRuntimeState(),
      window,
    });
  }

  async snapshotState(
    reason: string,
    limit = 20,
    filters?: GatewayHistoryFilter,
  ) {
    const readiness = await this.collectReadiness();
    const window = this.deps.loadHistoryWindow(limit, filters);
    const state = this.buildStateSnapshot(readiness, window, reason);
    const snapshot = buildGatewayRunnerHistorySnapshot({
      deps: this.deps,
      reason,
      readiness,
      window,
      state,
    });

    await this.deps.persistSnapshot(reason, snapshot);
    return snapshot;
  }
}
