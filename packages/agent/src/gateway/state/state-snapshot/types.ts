import type {
  getNativeMessagingTransportState,
  getNativeTransportControlPlane,
} from "@/runtime/native/service-bridge/transport-control";
import type {
  DeliveredMessageRecord,
  PlatformName,
  SessionRoute,
} from "@/types/gateway";
import type { GatewayDaemonRuntimeState } from "../../daemon-state";
import type {
  PlatformHealth,
  PlatformLifecycleEvent,
} from "../../platforms/base";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "../../read/history-view";
import type { GatewayPlatformStateView } from "../../read/platform-state-view";

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
