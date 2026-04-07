import type { PlatformName } from "@/types/gateway";
import type { PlatformHealth } from "../platforms/base";
import type {
  GatewayControlPlaneView,
  GatewayNativeMessagingStateView,
  GatewayPlatformStateView,
  GatewayTransportDetail,
  GatewayTransportJournalEntry,
  GatewayTransportSummaryEntry,
} from "../state/state-snapshot";
import { summarizeTransportJournalEntry } from "../trace-summary";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "./history-view";
import { createGatewayPlatformStateView } from "./platform-state-view";

function recentByPlatform<T extends { platform: PlatformName | "gateway" }>(
  records: readonly T[],
  platform: PlatformName,
  limit: number,
): T[] {
  return records
    .filter((record): record is T => record.platform === platform)
    .slice(-limit)
    .reverse();
}

export function buildGatewayTransportDetail(options: {
  platform: PlatformName;
  controlPlane: GatewayControlPlaneView;
  platformState?: GatewayPlatformStateView;
  readiness?: PlatformHealth;
  traces: readonly GatewayTraceRecord[];
  inbox: readonly GatewayInboxRecord[];
  outbox: readonly GatewayOutboxRecord[];
  attachments: readonly GatewayAttachmentRecord[];
  nativeMessagingState?: GatewayNativeMessagingStateView;
  recentLimit?: number;
  includeHealthMismatch?: boolean;
  countFromRecent?: boolean;
}): GatewayTransportDetail {
  const platformState =
    options.platformState ?? createGatewayPlatformStateView(options.platform);
  const inventory = options.controlPlane.transportInventory.find(
    (entry) => entry.platform === options.platform,
  );
  const messagingBridge = options.controlPlane.messagingBridge.find(
    (entry) => entry.platform === options.platform,
  );
  const recentLimit = options.recentLimit ?? 20;
  const platformTraces = options.traces.filter(
    (record) => record.platform === options.platform,
  );
  const platformInbox = options.inbox.filter(
    (record) => record.platform === options.platform,
  );
  const platformOutbox = options.outbox.filter(
    (record) => record.platform === options.platform,
  );
  const platformAttachments = options.attachments.filter(
    (record) => record.platform === options.platform,
  );
  const recentTraces = recentByPlatform(
    options.traces,
    options.platform,
    recentLimit,
  );
  const recentInbox = recentByPlatform(
    options.inbox,
    options.platform,
    recentLimit,
  );
  const recentOutbox = recentByPlatform(
    options.outbox,
    options.platform,
    recentLimit,
  );
  const recentAttachments = recentByPlatform(
    options.attachments,
    options.platform,
    recentLimit,
  );
  const mismatchFlags: string[] = [];
  if (inventory?.gatewayEnabled && !platformState.ready) {
    mismatchFlags.push("gateway-enabled-without-ready-platform");
  }
  if (inventory && inventory.operational !== platformState.ready) {
    mismatchFlags.push("inventory-operational-mismatch");
  }
  if (messagingBridge?.pluginEnabled && !messagingBridge.serviceAvailable) {
    mismatchFlags.push("plugin-enabled-without-runtime-service");
  }
  if (messagingBridge?.serviceAvailable && !messagingBridge.live) {
    mismatchFlags.push("runtime-service-not-live");
  }
  if (
    options.includeHealthMismatch &&
    options.readiness &&
    options.readiness.ready !== platformState.ready
  ) {
    mismatchFlags.push("health-ready-mismatch");
  }

  const source =
    inventory?.source ?? platformState.nativePluginSource ?? "custom";
  const lastActivityAt =
    platformState.lastUpdatedAt ??
    platformState.lastTraceAt ??
    platformState.lastEventAt ??
    (options.includeHealthMismatch
      ? options.readiness?.lastHeartbeatAt
      : undefined);

  return {
    platform: options.platform,
    inventory,
    messagingBridge,
    nativeMessagingState: options.nativeMessagingState,
    platformState,
    readiness: options.readiness,
    traceCount: options.countFromRecent
      ? recentTraces.length
      : platformTraces.length,
    inboxCount: options.countFromRecent
      ? recentInbox.length
      : platformInbox.length,
    outboxCount: options.countFromRecent
      ? recentOutbox.length
      : platformOutbox.length,
    attachmentCount: options.countFromRecent
      ? recentAttachments.length
      : platformAttachments.length,
    recentTraces,
    recentInbox,
    recentOutbox,
    recentAttachments,
    mismatchFlags,
    lastActivityAt,
    summary: summarizeTransportJournalEntry(
      {
        platform: options.platform,
        source,
        operational: inventory?.operational ?? false,
        ready:
          options.nativeMessagingState?.ready ??
          options.readiness?.ready ??
          false,
        transportState: platformState.transportState,
        status: options.readiness?.status,
        restartCount: platformState.restartCount,
        restartFailures: platformState.restartFailureCount,
        backoffUntilAt: platformState.nextRestartAt,
        traceCount: options.countFromRecent
          ? recentTraces.length
          : platformTraces.length,
        inboxCount: options.countFromRecent
          ? recentInbox.length
          : platformInbox.length,
        outboxCount: options.countFromRecent
          ? recentOutbox.length
          : platformOutbox.length,
        attachmentCount: options.countFromRecent
          ? recentAttachments.length
          : platformAttachments.length,
        mismatchFlags,
        lastTraceKind: platformState.lastTraceKind,
        lastEventKind: platformState.lastEventKind,
        nativeMessagingSummary: options.nativeMessagingState?.summary,
      },
      lastActivityAt,
    ),
  };
}

export function buildGatewayTransportSummaryEntry(
  entry: GatewayTransportDetail,
): GatewayTransportSummaryEntry {
  return {
    platform: entry.platform,
    source:
      entry.inventory?.source ??
      entry.platformState?.nativePluginSource ??
      "custom",
    configEnabled: entry.inventory?.configEnabled ?? false,
    gatewayEnabled: entry.inventory?.gatewayEnabled ?? false,
    operational: entry.inventory?.operational ?? false,
    ready: entry.readiness?.ready ?? false,
    transportState: entry.platformState?.transportState,
    status: entry.readiness?.status,
    traceCount: entry.traceCount,
    inboxCount: entry.inboxCount,
    outboxCount: entry.outboxCount,
    attachmentCount: entry.attachmentCount,
    mismatchFlags: entry.mismatchFlags,
    lastTraceKind: entry.platformState?.lastTraceKind,
    lastEventKind: entry.platformState?.lastEventKind,
    detail:
      entry.inventory?.detail ??
      entry.platformState?.detail ??
      entry.readiness?.detail ??
      "n/a",
  };
}

export function buildGatewayTransportJournalEntry(
  entry: GatewayTransportDetail,
): GatewayTransportJournalEntry {
  const source =
    entry.inventory?.source ??
    entry.platformState?.nativePluginSource ??
    "custom";
  const lastActivityAt =
    entry.platformState?.lastUpdatedAt ??
    entry.platformState?.lastTraceAt ??
    entry.platformState?.lastEventAt;

  return {
    platform: entry.platform,
    source,
    operational: entry.inventory?.operational ?? false,
    ready: entry.readiness?.ready ?? false,
    transportState: entry.platformState?.transportState,
    status: entry.readiness?.status,
    restartCount: entry.platformState?.restartCount ?? 0,
    restartFailures: entry.platformState?.restartFailureCount ?? 0,
    backoffUntilAt: entry.platformState?.nextRestartAt,
    traceCount: entry.traceCount,
    inboxCount: entry.inboxCount,
    outboxCount: entry.outboxCount,
    attachmentCount: entry.attachmentCount,
    mismatchFlags: entry.mismatchFlags,
    lastActivityAt,
    lastTraceKind: entry.platformState?.lastTraceKind,
    lastEventKind: entry.platformState?.lastEventKind,
    summary: summarizeTransportJournalEntry(
      {
        platform: entry.platform,
        source,
        operational: entry.inventory?.operational ?? false,
        ready: entry.readiness?.ready ?? false,
        transportState: entry.platformState?.transportState,
        status: entry.readiness?.status,
        restartCount: entry.platformState?.restartCount ?? 0,
        restartFailures: entry.platformState?.restartFailureCount ?? 0,
        backoffUntilAt: entry.platformState?.nextRestartAt,
        traceCount: entry.traceCount,
        inboxCount: entry.inboxCount,
        outboxCount: entry.outboxCount,
        attachmentCount: entry.attachmentCount,
        mismatchFlags: entry.mismatchFlags,
        lastTraceKind: entry.platformState?.lastTraceKind,
        lastEventKind: entry.platformState?.lastEventKind,
      },
      lastActivityAt,
    ),
  };
}
