import { createPlatformAdapter } from "@/gateway/adapters/platform-adapter-factory";
import type {
  GatewayDaemonState,
  GatewayRestartState,
} from "@/gateway/daemon-state";
import type {
  GatewayAttachmentRecord,
  GatewayHistoryFilter,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "@/gateway/read/history-view";
import type {
  GatewayRunnerReadModel,
  GatewayRuntimeStatus,
} from "@/gateway/read/read-model";
import type {
  GatewayReceiveOptions,
  GatewayReceiveResult,
} from "@/gateway/receive/index";
import type { GatewayInboxReplayResult } from "@/gateway/receive/replay";
import { composeGatewayRunnerRuntime } from "@/gateway/runner/composition";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type { GatewayRunnerControlPlane } from "@/gateway/runner/control-plane";
import { resolveNativeMessagingPlugin } from "@/gateway/runner/native-resolution";
import type { GatewayRunnerOperations } from "@/gateway/runner/operations";
import {
  createGatewayRunnerPlatformAccessors,
  type GatewayRunnerPlatformAccessors,
} from "@/gateway/runner/platform-accessors";
import type { GatewayRunnerReadSurface } from "@/gateway/runner/read-surface";
import type { GatewayRunnerRecording } from "@/gateway/runner/recording";
import type { GatewayRunnerStateBookkeeping } from "@/gateway/runner/state";
import type {
  GatewayHistorySnapshot,
  GatewayPlatformStateView,
  GatewayStateSnapshot,
  GatewayTransportDetail,
} from "@/gateway/state/state-snapshot";
import type { GatewaySupervisionRecord } from "@/gateway/supervision/index";
import { getNativeTransportControlPlane } from "@/runtime/native/service-bridge/index";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  PlatformName,
} from "@/types/gateway";
import type {
  PlatformAdapter,
  PlatformHealth,
  PlatformLifecycleEvent,
} from "../platforms/base";

export class GatewayRunnerRuntime {
  private readonly adapters = new Map<PlatformName, PlatformAdapter>();
  private readonly traceLog: GatewayTraceRecord[];
  private readonly inboxLog: GatewayInboxRecord[];
  private readonly outboxLog: GatewayOutboxRecord[];
  private readonly attachmentLog: GatewayAttachmentRecord[];
  private readonly platformStates = new Map<
    PlatformName,
    GatewayPlatformStateView
  >();
  private readonly snapshotPath: string;
  private readonly snapshotHistoryPath: string;
  private readonly runtimeStatusPath: string;
  private readonly supervisionPath: string;
  private readonly inboxPath: string;
  private readonly outboxPath: string;
  private readonly attachmentsPath: string;
  private readonly daemonState: GatewayDaemonState = {
    heartbeatRuns: 0,
    watchdogRuns: 0,
    restartRuns: 0,
    restartRecoveries: 0,
    restartBackoffs: 0,
    watchdogSkips: 0,
  };
  private readonly restartBackoffByPlatform = new Map<
    PlatformName,
    GatewayRestartState
  >();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private supervisionInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private startedAt?: string;
  private stoppedAt?: string;
  private lastHeartbeatAt?: string;
  private lastSupervisionAt?: string;
  private readonly supervisionLog: GatewaySupervisionRecord[];
  private readonly controlPlane: GatewayRunnerControlPlane;
  private readonly stateBookkeeping: GatewayRunnerStateBookkeeping;
  private readonly readModel: GatewayRunnerReadModel;
  private readonly readSurface: GatewayRunnerReadSurface;
  private readonly recording: GatewayRunnerRecording;
  private readonly operations: GatewayRunnerOperations;
  private readonly platformAccessors: GatewayRunnerPlatformAccessors;

  private getTransportControlPlane() {
    return getNativeTransportControlPlane(
      this.context.runtime,
      this.context.config,
      this.context.services.gatewayConfig,
    );
  }

  constructor(private readonly context: GatewayRunnerContext) {
    this.platformAccessors = createGatewayRunnerPlatformAccessors(this.context);
    const assembled = composeGatewayRunnerRuntime({
      context: this.context,
      adapters: this.adapters,
      platformStates: this.platformStates,
      daemonState: this.daemonState,
      restartBackoffByPlatform: this.restartBackoffByPlatform,
      resolveNativeMessagingPlugin: (platform) =>
        resolveNativeMessagingPlugin({
          config: this.context.config,
          gatewayConfig: this.context.services.gatewayConfig,
          runtime: this.context.runtime,
          platform,
        }),
      getConfiguredPlatforms: this.platformAccessors.getConfiguredPlatforms,
      isPlatformEnabled: this.platformAccessors.isPlatformEnabled,
      getTransportControlPlane: this.getTransportControlPlane.bind(this),
      isRunning: () => this.running,
      getWatchdogAt: () => this.daemonState.lastWatchdogAt,
      getRuntimeMeta: () => ({
        pid: process.pid,
        running: this.running,
        updatedAt: new Date().toISOString(),
        startedAt: this.startedAt,
        stoppedAt: this.stoppedAt,
        lastHeartbeatAt: this.lastHeartbeatAt,
        lastWatchdogAt: this.daemonState.lastWatchdogAt,
        lastSupervisionAt: this.lastSupervisionAt,
        adapterPlatforms: Array.from(this.adapters.keys()),
      }),
      getNativeMessagingState: this.platformAccessors.getNativeMessagingState,
      setRunning: (value) => {
        this.running = value;
      },
      getStartedAt: () => this.startedAt,
      setStartedAt: (value) => {
        this.startedAt = value;
      },
      getStoppedAt: () => this.stoppedAt,
      setStoppedAt: (value) => {
        this.stoppedAt = value;
      },
      getLastHeartbeatAt: () => this.lastHeartbeatAt,
      setLastHeartbeatAt: (value) => {
        this.lastHeartbeatAt = value;
      },
      getHeartbeatInterval: () => this.heartbeatInterval,
      setHeartbeatInterval: (value) => {
        this.heartbeatInterval = value;
      },
      getSupervisionInterval: () => this.supervisionInterval,
      setSupervisionInterval: (value) => {
        this.supervisionInterval = value;
      },
      createAdapter: this.createAdapter.bind(this),
      runHeartbeat: this.heartbeat.bind(this),
      runWatchdog: this.watchdog.bind(this),
      observeAdapter: this.observeAdapter.bind(this),
      snapshotState: this.snapshotState.bind(this),
      setLastSupervisionAt: (at) => {
        this.lastSupervisionAt = at;
      },
      getOutboxSessionIdByDeliveryId: (deliveryId) =>
        this.outboxLog
          .slice()
          .reverse()
          .find((record) => record.deliveryId === deliveryId)?.sessionId,
      getRuntimeStatus: this.runtimeStatus.bind(this),
    });

    this.snapshotPath = assembled.snapshotPath;
    this.snapshotHistoryPath = assembled.snapshotHistoryPath;
    this.runtimeStatusPath = assembled.runtimeStatusPath;
    this.supervisionPath = assembled.supervisionPath;
    this.inboxPath = assembled.inboxPath;
    this.outboxPath = assembled.outboxPath;
    this.attachmentsPath = assembled.attachmentsPath;
    this.traceLog = assembled.traceLog;
    this.inboxLog = assembled.inboxLog;
    this.outboxLog = assembled.outboxLog;
    this.attachmentLog = assembled.attachmentLog;
    this.supervisionLog = assembled.supervisionLog;
    this.stateBookkeeping = assembled.stateBookkeeping;
    this.readModel = assembled.readModel;
    this.readSurface = assembled.readSurface;
    this.recording = assembled.recording;
    this.controlPlane = assembled.controlPlane;
    this.operations = assembled.operations;
  }

  private async observeAdapter(
    platform: PlatformName,
    event: PlatformLifecycleEvent,
  ): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter?.observe) {
      return;
    }
    await adapter.observe(event);
  }

  async start(): Promise<void> {
    await this.controlPlane.start();
  }

  private createAdapter(platform: PlatformName): PlatformAdapter {
    return createPlatformAdapter(platform, this.context);
  }

  async stop(): Promise<void> {
    await this.controlPlane.stop();
  }

  async heartbeat(reason = "heartbeat"): Promise<GatewayStateSnapshot> {
    return this.controlPlane.heartbeat(reason);
  }

  runtimeStatus(): GatewayRuntimeStatus {
    return this.readSurface.runtimeStatus();
  }

  async transport(platform: PlatformName): Promise<GatewayTransportDetail> {
    return this.readSurface.transport(platform);
  }

  async transportOverview(): Promise<{
    details: GatewayTransportDetail[];
    mismatchCount: number;
    operationalCount: number;
  }> {
    return this.readSurface.transportOverview();
  }

  async supervise(reason = "manual"): Promise<GatewaySupervisionRecord[]> {
    return this.controlPlane.supervise(reason);
  }

  async watchdog(reason = "watchdog"): Promise<GatewaySupervisionRecord[]> {
    return this.controlPlane.watchdog(reason);
  }

  async watch(
    platform: PlatformName | "all",
    reason = "manual-watch",
  ): Promise<GatewaySupervisionRecord[]> {
    return this.controlPlane.watch(platform, reason);
  }

  async restart(
    platform: PlatformName | "all",
    reason = "manual",
  ): Promise<GatewaySupervisionRecord[]> {
    return this.controlPlane.restart(platform, reason);
  }

  async receive(
    message: IncomingPlatformMessage,
    options?: GatewayReceiveOptions,
  ): Promise<GatewayReceiveResult> {
    return this.operations.receive(message, options);
  }

  async sendToHomes(
    text: string,
    options?: {
      metadata?: Record<string, string>;
      platforms?: PlatformName[];
      name?: string;
    },
  ): Promise<DeliveredMessageRecord[]> {
    return this.operations.sendToHomes(text, options);
  }

  async editDelivery(
    deliveryId: string,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ): Promise<DeliveredMessageRecord> {
    return this.operations.editDelivery(deliveryId, text, options);
  }

  async sendProgressive(
    target: {
      platform: PlatformName;
      roomId: string;
      userId?: string;
      threadId?: string;
      replyToId?: string;
      metadata?: Record<string, string>;
    },
    parts: string[],
  ): Promise<DeliveredMessageRecord> {
    return this.operations.sendProgressive(target, parts);
  }

  async health(): Promise<Array<PlatformHealth>> {
    return this.readSurface.health();
  }

  trace(limit = 20, filters?: GatewayHistoryFilter): GatewayTraceRecord[] {
    return this.readSurface.trace(limit, filters);
  }

  async state(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayStateSnapshot> {
    return this.readSurface.state(limit, filters);
  }

  async history(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayHistorySnapshot> {
    return this.readSurface.history(limit, filters);
  }

  inbox(limit = 20, filters?: GatewayHistoryFilter): GatewayInboxRecord[] {
    return this.readSurface.inbox(limit, filters);
  }

  outbox(limit = 20, filters?: GatewayHistoryFilter): GatewayOutboxRecord[] {
    return this.readSurface.outbox(limit, filters);
  }

  attachments(
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): GatewayAttachmentRecord[] {
    return this.readSurface.attachments(limit, filters);
  }

  supervision(limit = 20): GatewaySupervisionRecord[] {
    return this.readSurface.supervision(limit);
  }

  async replayInbox(recordId: string): Promise<GatewayInboxReplayResult> {
    return this.readSurface.replayInbox(recordId);
  }

  async snapshotState(
    reason: string,
    limit = 20,
    filters?: GatewayHistoryFilter,
  ): Promise<GatewayHistorySnapshot> {
    return this.stateBookkeeping.snapshotState(reason, limit, filters);
  }

  onUpdate(
    listener: (event: {
      kind: GatewayTraceRecord["kind"];
      platform: GatewayTraceRecord["platform"];
      detail: string;
    }) => void,
  ): () => void {
    return this.recording.onUpdate(listener);
  }
}
