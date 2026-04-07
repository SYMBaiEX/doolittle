import type {
  getNativeMessagingTransportState,
  getNativeTransportControlPlane,
} from "@/runtime/native/service-bridge/index";
import type {
  DeliveredMessageRecord,
  PlatformName,
  SessionRoute,
} from "@/types/gateway";
import type { GatewayDaemonRuntimeState } from "../daemon-state";
import type { PlatformHealth, PlatformLifecycleEvent } from "../platforms/base";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "../read/history-view";
import {
  buildPlatformStateFromSnapshot,
  createGatewayPlatformStateView,
  type GatewayPlatformStateView,
} from "../read/platform-state-view";
import {
  buildGatewayTransportDetail,
  buildGatewayTransportJournalEntry,
  buildGatewayTransportSummaryEntry,
} from "../read/transport-detail";
import { countByKind, countByPlatform, countByString } from "../trace-summary";

export type { GatewayPlatformStateView } from "../read/platform-state-view";
export { buildGatewayTransportDetail };

export interface GatewayTransportInventoryEntry {
  platform: PlatformName;
  source?: string;
  configEnabled: boolean;
  gatewayEnabled: boolean;
  operational: boolean;
  detail: string;
}

export interface GatewayControlPlaneView {
  totals: ReturnType<typeof getNativeTransportControlPlane>["totals"];
  transportInventory: Array<
    ReturnType<
      typeof getNativeTransportControlPlane
    >["transportInventory"][number]
  >;
  messagingBridge: Array<
    ReturnType<typeof getNativeTransportControlPlane>["messagingBridge"][number]
  >;
}

export type GatewayNativeMessagingStateView = ReturnType<
  typeof getNativeMessagingTransportState
>;

export interface GatewayTransportDetail {
  platform: PlatformName;
  inventory?: ReturnType<
    typeof getNativeTransportControlPlane
  >["transportInventory"][number];
  messagingBridge?: ReturnType<
    typeof getNativeTransportControlPlane
  >["messagingBridge"][number];
  nativeMessagingState?: GatewayNativeMessagingStateView;
  platformState?: GatewayPlatformStateView;
  readiness?: PlatformHealth;
  traceCount: number;
  inboxCount: number;
  outboxCount: number;
  attachmentCount: number;
  recentTraces: GatewayTraceRecord[];
  recentInbox: GatewayInboxRecord[];
  recentOutbox: GatewayOutboxRecord[];
  recentAttachments: GatewayAttachmentRecord[];
  mismatchFlags: string[];
  lastActivityAt?: string;
  summary: string;
}

export interface GatewayTransportSummaryEntry {
  platform: PlatformName;
  source?: string;
  configEnabled: boolean;
  gatewayEnabled: boolean;
  operational: boolean;
  ready: boolean;
  transportState?: GatewayPlatformStateView["transportState"];
  status?: PlatformHealth["status"];
  traceCount: number;
  inboxCount: number;
  outboxCount: number;
  attachmentCount: number;
  mismatchFlags: string[];
  lastTraceKind?: GatewayTraceRecord["kind"];
  lastEventKind?: PlatformLifecycleEvent["kind"];
  detail: string;
}

export interface GatewayTransportJournalEntry {
  platform: PlatformName;
  source: string;
  operational: boolean;
  ready: boolean;
  transportState?: GatewayPlatformStateView["transportState"];
  status?: PlatformHealth["status"];
  restartCount: number;
  restartFailures: number;
  backoffUntilAt?: string;
  traceCount: number;
  inboxCount: number;
  outboxCount: number;
  attachmentCount: number;
  mismatchFlags: string[];
  lastActivityAt?: string;
  lastTraceKind?: GatewayTraceRecord["kind"];
  lastEventKind?: PlatformLifecycleEvent["kind"];
  summary: string;
}

export interface GatewayStateSnapshot {
  running: boolean;
  updatedAt: string;
  reason: string;
  heartbeatAt?: string;
  watchdogAt?: string;
  snapshotPath: string;
  historyPath: string;
  daemon: GatewayDaemonRuntimeState;
  totals: {
    configuredPlatforms: number;
    activeAdapters: number;
    readyAdapters: number;
    gatewayEnabledTransports: number;
    operationalTransports: number;
    nativeAdapters: number;
    mockAdapters: number;
    pluginMediatedAdapters: number;
    officialPluginAdapters: number;
    vendoredPluginAdapters: number;
    totalTraces: number;
    recentTraces: number;
    inboxMessages: number;
    outboxMessages: number;
    attachmentRecords: number;
    recentDeliveries: number;
    recentSessions: number;
  };
  platforms: GatewayPlatformStateView[];
  transportOverview: {
    mismatchCount: number;
    operationalCount: number;
    details: GatewayTransportDetail[];
  };
  transportSummaries: GatewayTransportSummaryEntry[];
  transportJournal: GatewayTransportJournalEntry[];
  tracesByKind: Array<{ kind: GatewayTraceRecord["kind"]; count: number }>;
  tracesByPlatform: Array<{
    platform: PlatformName | "gateway";
    count: number;
  }>;
  inboxByPlatform: Array<{ platform: PlatformName; count: number }>;
  outboxByPlatform: Array<{ platform: PlatformName; count: number }>;
  attachmentsByPlatform: Array<{ platform: PlatformName; count: number }>;
  attachmentsByKind: Array<{ kind: string; count: number }>;
  deliveriesByPlatform: Array<{ platform: PlatformName; count: number }>;
  sessionsByPlatform: Array<{ platform: PlatformName; count: number }>;
}

export interface GatewayHistorySnapshot {
  updatedAt: string;
  reason: string;
  snapshotPath: string;
  historyPath: string;
  watchdogAt?: string;
  readiness: PlatformHealth[];
  transportOverview: {
    mismatchCount: number;
    operationalCount: number;
    details: GatewayTransportDetail[];
  };
  transportSummaries: GatewayTransportSummaryEntry[];
  transportJournal: GatewayTransportJournalEntry[];
  traces: GatewayTraceRecord[];
  inbox: GatewayInboxRecord[];
  outbox: GatewayOutboxRecord[];
  attachments: GatewayAttachmentRecord[];
  deliveries: DeliveredMessageRecord[];
  sessions: SessionRoute[];
  state: GatewayStateSnapshot;
}

export interface GatewayStateSnapshotInputs {
  running: boolean;
  reason: string;
  snapshotPath: string;
  historyPath: string;
  daemon: GatewayDaemonRuntimeState;
  controlPlane: GatewayControlPlaneView;
  readiness: PlatformHealth[];
  platformStates: ReadonlyMap<PlatformName, GatewayPlatformStateView>;
  allTraces: GatewayTraceRecord[];
  traces: GatewayTraceRecord[];
  inbox: GatewayInboxRecord[];
  outbox: GatewayOutboxRecord[];
  attachments: GatewayAttachmentRecord[];
  deliveries: DeliveredMessageRecord[];
  sessions: SessionRoute[];
  heartbeatAt?: string;
  watchdogAt?: string;
  now?: string;
}

export function buildGatewayStateSnapshot(
  options: GatewayStateSnapshotInputs,
): GatewayStateSnapshot {
  const timestamp = options.now ?? new Date().toISOString();
  const readinessByPlatform = new Map(
    options.readiness.map((entry) => [entry.platform, entry] as const),
  );
  const platformSummary = options.readiness.map((entry) =>
    buildPlatformStateFromSnapshot({
      platform: entry.platform,
      readiness: entry,
      platformState:
        options.platformStates.get(entry.platform) ??
        createGatewayPlatformStateView(entry.platform),
      allTraces: options.allTraces,
      inbox: options.inbox,
      outbox: options.outbox,
      attachments: options.attachments,
      now: timestamp,
    }),
  );
  const transportOverviewDetails = platformSummary.map((entry) =>
    buildGatewayTransportDetail({
      platform: entry.platform,
      controlPlane: options.controlPlane,
      platformState:
        options.platformStates.get(entry.platform) ??
        createGatewayPlatformStateView(entry.platform),
      readiness: readinessByPlatform.get(entry.platform),
      traces: options.allTraces,
      inbox: options.inbox,
      outbox: options.outbox,
      attachments: options.attachments,
      recentLimit: 20,
      includeHealthMismatch: false,
    }),
  );
  const transportSummaries = transportOverviewDetails.map(
    buildGatewayTransportSummaryEntry,
  );
  const transportJournal = transportOverviewDetails.map(
    buildGatewayTransportJournalEntry,
  );

  return {
    running: options.running,
    updatedAt: timestamp,
    reason: options.reason,
    watchdogAt: options.watchdogAt,
    heartbeatAt: options.heartbeatAt,
    snapshotPath: options.snapshotPath,
    historyPath: options.historyPath,
    daemon: options.daemon,
    totals: {
      configuredPlatforms: options.readiness.length,
      activeAdapters: options.readiness.filter(
        (entry) => entry.status === "running",
      ).length,
      readyAdapters: options.readiness.filter((entry) => entry.ready).length,
      gatewayEnabledTransports: options.controlPlane.totals.gatewayEnabled,
      operationalTransports: options.controlPlane.totals.operationalTransports,
      nativeAdapters: options.readiness.filter(
        (entry) => entry.mode === "native",
      ).length,
      mockAdapters: options.readiness.filter((entry) => entry.mode === "mock")
        .length,
      pluginMediatedAdapters: platformSummary.filter((entry) =>
        Boolean(entry.nativePluginId),
      ).length,
      officialPluginAdapters: platformSummary.filter(
        (entry) => entry.nativePluginSource === "official",
      ).length,
      vendoredPluginAdapters: platformSummary.filter(
        (entry) => entry.nativePluginSource === "vendored",
      ).length,
      totalTraces: options.allTraces.length,
      recentTraces: options.traces.length,
      inboxMessages: options.inbox.length,
      outboxMessages: options.outbox.length,
      attachmentRecords: options.attachments.length,
      recentDeliveries: options.deliveries.length,
      recentSessions: options.sessions.length,
    },
    platforms: platformSummary,
    transportOverview: {
      mismatchCount: transportOverviewDetails.filter(
        (entry) => entry.mismatchFlags.length > 0,
      ).length,
      operationalCount: transportOverviewDetails.filter(
        (entry) => entry.inventory?.operational,
      ).length,
      details: transportOverviewDetails,
    },
    transportSummaries,
    transportJournal,
    tracesByKind: countByKind(options.allTraces, (trace) => trace.kind),
    tracesByPlatform: countByPlatform(
      options.allTraces,
      (trace) => trace.platform,
    ),
    inboxByPlatform: countByPlatform(
      options.inbox,
      (record) => record.platform,
    ),
    outboxByPlatform: countByPlatform(
      options.outbox,
      (record) => record.platform,
    ),
    attachmentsByPlatform: countByPlatform(
      options.attachments,
      (record) => record.platform,
    ),
    attachmentsByKind: countByString(
      options.attachments,
      (record) => record.kind,
    ),
    deliveriesByPlatform: countByPlatform(
      options.deliveries,
      (delivery) => delivery.target.platform,
    ),
    sessionsByPlatform: countByPlatform(
      options.sessions,
      (session) => session.platform,
    ),
  };
}
