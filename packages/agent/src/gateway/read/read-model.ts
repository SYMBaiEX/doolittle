import type { GatewayDaemonRuntimeState } from "@/gateway/daemon-state";
import type { GatewayReceiveResult } from "@/gateway/receive/index";
import {
  type GatewayInboxReplayResult,
  replayGatewayInboxRecord,
} from "@/gateway/receive/replay";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import type { IncomingPlatformMessage, PlatformName } from "@/types/gateway";
import type { PlatformHealth } from "../platforms/base";
import {
  buildGatewayTransportDetail,
  type GatewayControlPlaneView,
  type GatewayHistorySnapshot,
  type GatewayNativeMessagingStateView,
  type GatewayStateSnapshot,
  type GatewayTransportDetail,
} from "../state/state-snapshot";
import type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayHistoryView,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "./history-view";

export interface GatewayRuntimeStatus {
  pid: number;
  running: boolean;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeatAt?: string;
  lastWatchdogAt?: string;
  lastSupervisionAt?: string;
  supervisionEvents: number;
  adapters: PlatformName[];
  daemon: GatewayDaemonRuntimeState;
  journalPaths: {
    snapshot: string;
    history: string;
    runtime: string;
    supervision: string;
    inbox: string;
    outbox: string;
    attachments: string;
  };
  transportControl: GatewayControlPlaneView["totals"];
  messagingBridge: GatewayControlPlaneView["messagingBridge"];
  transportInventory: GatewayControlPlaneView["transportInventory"];
}

interface GatewayRunnerReadModelRuntimeMeta {
  pid: number;
  running: boolean;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeatAt?: string;
  lastWatchdogAt?: string;
  lastSupervisionAt?: string;
  adapterPlatforms: PlatformName[];
  journalPaths: GatewayRuntimeStatus["journalPaths"];
}

export interface GatewayRunnerReadModelDeps {
  historyView: GatewayHistoryView;
  traceLog: readonly GatewayTraceRecord[];
  inboxLog: readonly GatewayInboxRecord[];
  outboxLog: readonly GatewayOutboxRecord[];
  attachmentLog: readonly GatewayAttachmentRecord[];
  supervisionLog: readonly GatewaySupervisionRecord[];
  getTransportControlPlane: () => GatewayControlPlaneView;
  buildDaemonRuntimeState: () => GatewayDaemonRuntimeState;
  getRuntimeMeta: () => GatewayRunnerReadModelRuntimeMeta;
  snapshotState: (
    reason: string,
    limit?: number,
    filters?: GatewayHistoryFilter,
  ) => Promise<GatewayHistorySnapshot>;
  getConfiguredPlatforms: () => PlatformName[];
  getNativeMessagingState: (
    platform: PlatformName,
  ) => GatewayNativeMessagingStateView | undefined;
  receive: (message: IncomingPlatformMessage) => Promise<GatewayReceiveResult>;
}

export class GatewayRunnerReadModel {
  constructor(private readonly deps: GatewayRunnerReadModelDeps) {}

  runtimeStatus(): GatewayRuntimeStatus {
    const controlPlane = this.deps.getTransportControlPlane();
    const meta = this.deps.getRuntimeMeta();
    return {
      pid: meta.pid,
      running: meta.running,
      updatedAt: meta.updatedAt,
      startedAt: meta.startedAt,
      stoppedAt: meta.stoppedAt,
      lastHeartbeatAt: meta.lastHeartbeatAt,
      lastWatchdogAt: meta.lastWatchdogAt,
      lastSupervisionAt: meta.lastSupervisionAt,
      supervisionEvents: this.deps.supervisionLog.length,
      adapters: meta.adapterPlatforms,
      daemon: this.deps.buildDaemonRuntimeState(),
      journalPaths: meta.journalPaths,
      transportControl: controlPlane.totals,
      messagingBridge: controlPlane.messagingBridge,
      transportInventory: controlPlane.transportInventory,
    };
  }

  async transport(platform: PlatformName): Promise<GatewayTransportDetail> {
    const controlPlane = this.deps.getTransportControlPlane();
    const readiness = (await this.health()).find(
      (entry) => entry.platform === platform,
    );
    const state = await this.state(100, { platform });
    const platformState = state.platforms.find(
      (entry) => entry.platform === platform,
    );
    return buildGatewayTransportDetail({
      platform,
      controlPlane,
      platformState,
      readiness,
      traces: this.deps.traceLog,
      inbox: this.deps.inboxLog,
      outbox: this.deps.outboxLog,
      attachments: this.deps.attachmentLog,
      nativeMessagingState: this.deps.getNativeMessagingState(platform),
      includeHealthMismatch: true,
      recentLimit: 20,
      countFromRecent: true,
    });
  }

  async transportOverview(): Promise<{
    details: GatewayTransportDetail[];
    mismatchCount: number;
    operationalCount: number;
  }> {
    const details = await Promise.all(
      this.deps
        .getConfiguredPlatforms()
        .map((platform) => this.transport(platform)),
    );
    return {
      details,
      mismatchCount: details.filter((entry) => entry.mismatchFlags.length > 0)
        .length,
      operationalCount: details.filter((entry) => entry.inventory?.operational)
        .length,
    };
  }

  async health(): Promise<PlatformHealth[]> {
    const snapshot = await this.deps.snapshotState("health", 20);
    return snapshot.readiness;
  }

  trace(limit = 20, filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.deps.historyView.trace(limit, filters);
  }

  async state(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayStateSnapshot> {
    return (await this.history(limit, filters)).state;
  }

  async history(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayHistorySnapshot> {
    return this.deps.snapshotState("history", limit, filters);
  }

  inbox(limit = 20, filters?: GatewayHistoryFilter): GatewayInboxRecord[] {
    return this.deps.historyView.inbox(limit, filters);
  }

  outbox(limit = 20, filters?: GatewayHistoryFilter): GatewayOutboxRecord[] {
    return this.deps.historyView.outbox(limit, filters);
  }

  attachments(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): GatewayAttachmentRecord[] {
    return this.deps.historyView.attachments(limit, filters);
  }

  supervision(limit = 20): GatewaySupervisionRecord[] {
    return this.deps.supervisionLog.slice(-limit).reverse();
  }

  async replayInbox(recordId: string): Promise<GatewayInboxReplayResult> {
    const record = this.deps.inboxLog.find(
      (entry) => entry.recordId === recordId,
    );
    if (!record) {
      throw new Error(`Inbox record ${recordId} was not found.`);
    }

    return replayGatewayInboxRecord({
      record,
      receive: this.deps.receive,
      transport: (platform) => this.transport(platform),
    });
  }
}
