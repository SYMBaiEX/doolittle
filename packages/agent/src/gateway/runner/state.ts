import {
  buildGatewayDaemonRuntimeState,
  ensureGatewayRestartState,
  GATEWAY_DAEMON_POLICY,
  type GatewayDaemonRuntimeState,
  type GatewayDaemonState,
  type GatewayRestartState,
} from "@/gateway/daemon-state";
import type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "@/gateway/read/history-view";
import {
  collectGatewayReadiness,
  mergePlatformHealthState,
} from "@/gateway/read/status-readiness";
import {
  applyGatewayHealthToPlatformState,
  buildGatewayPlatformPresence,
  createGatewayPlatformState,
  type GatewayNativePluginInfo,
} from "@/gateway/state/platform-state";
import {
  buildGatewayStateSnapshot,
  type GatewayControlPlaneView,
  type GatewayHistorySnapshot,
  type GatewayPlatformStateView,
  type GatewayStateSnapshot,
} from "@/gateway/state/state-snapshot";
import { applyGatewayTraceToPlatformState } from "@/gateway/state/trace-state";
import type {
  DeliveredMessageRecord,
  PlatformName,
  SessionRoute,
} from "@/types/gateway";
import {
  nowIso,
  type PlatformAdapter,
  type PlatformHealth,
  type PlatformPresenceState,
} from "../platforms/base";

export interface GatewayRunnerHistoryWindow {
  allTraces: GatewayTraceRecord[];
  traces: GatewayTraceRecord[];
  inbox: GatewayInboxRecord[];
  outbox: GatewayOutboxRecord[];
  attachments: GatewayAttachmentRecord[];
  deliveries: DeliveredMessageRecord[];
  sessions: SessionRoute[];
}

export interface GatewayRunnerStateBookkeepingDeps {
  adapters: ReadonlyMap<PlatformName, PlatformAdapter>;
  platformStates: Map<PlatformName, GatewayPlatformStateView>;
  restartBackoffByPlatform: Map<PlatformName, GatewayRestartState>;
  daemonState: GatewayDaemonState;
  resolveNativeMessagingPlugin: (
    platform: PlatformName,
  ) => GatewayNativePluginInfo | undefined;
  getConfiguredPlatforms: () => PlatformName[];
  isPlatformEnabled: (platform: PlatformName) => boolean;
  getTransportControlPlane: () => GatewayControlPlaneView;
  isRunning: () => boolean;
  getSnapshotPaths: () => {
    snapshotPath: string;
    historyPath: string;
  };
  getWatchdogAt: () => string | undefined;
  loadHistoryWindow: (
    limit: number,
    filters?: GatewayHistoryFilter,
  ) => GatewayRunnerHistoryWindow;
  persistSnapshot: (
    reason: string,
    snapshot: GatewayHistorySnapshot,
  ) => Promise<void>;
}

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
      this.deps.resolveNativeMessagingPlugin(platform),
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
      buildPresence: this.snapshotPresence.bind(this),
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
    const paths = this.deps.getSnapshotPaths();

    return buildGatewayStateSnapshot({
      running: this.deps.isRunning(),
      reason,
      snapshotPath: paths.snapshotPath,
      historyPath: paths.historyPath,
      daemon: this.buildDaemonRuntimeState(),
      controlPlane: this.deps.getTransportControlPlane(),
      readiness,
      platformStates: this.deps.platformStates,
      allTraces: window.allTraces,
      traces: window.traces,
      inbox: window.inbox,
      outbox: window.outbox,
      attachments: window.attachments,
      deliveries: window.deliveries,
      sessions: window.sessions,
      heartbeatAt: this.deriveHeartbeatAt(),
      watchdogAt: this.deps.getWatchdogAt(),
    });
  }

  async snapshotState(
    reason: string,
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayHistorySnapshot> {
    const readiness = await this.collectReadiness();
    const window = this.deps.loadHistoryWindow(limit, filters);
    const state = this.buildStateSnapshot(readiness, window, reason);
    const paths = this.deps.getSnapshotPaths();
    const snapshot: GatewayHistorySnapshot = {
      updatedAt: state.updatedAt,
      reason,
      snapshotPath: paths.snapshotPath,
      historyPath: paths.historyPath,
      readiness,
      transportOverview: state.transportOverview,
      transportSummaries: state.transportSummaries,
      transportJournal: state.transportJournal,
      traces: window.traces,
      inbox: window.inbox,
      outbox: window.outbox,
      attachments: window.attachments,
      deliveries: window.deliveries,
      sessions: window.sessions,
      state,
    };

    await this.deps.persistSnapshot(reason, snapshot);
    return snapshot;
  }

  private snapshotPresence(
    status: PlatformPresenceState["status"],
    activity: string,
    lastHeartbeatAt?: string,
  ): PlatformPresenceState {
    return buildGatewayPlatformPresence(
      status,
      activity,
      nowIso,
      lastHeartbeatAt,
    );
  }

  private deriveHeartbeatAt(): string | undefined {
    if (this.deps.platformStates.size === 0) {
      return undefined;
    }

    return Array.from(this.deps.platformStates.values())
      .map((state) => state.lastHeartbeatAt)
      .filter(Boolean)
      .at(-1);
  }
}
