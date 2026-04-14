import { buildGatewaySnapshotPlatformViews } from "./platforms";
import { buildGatewaySnapshotTotals } from "./totals";
import type { GatewayStateSnapshot, GatewayStateSnapshotInputs } from "./types";

export type { GatewayPlatformStateView } from "../../read/platform-state-view";
export { buildGatewayTransportDetail } from "../../read/transport-detail";
export type {
  GatewayControlPlaneView,
  GatewayHistorySnapshot,
  GatewayNativeMessagingStateView,
  GatewayStateSnapshot,
  GatewayStateSnapshotInputs,
  GatewayTransportDetail,
  GatewayTransportInventoryEntry,
  GatewayTransportJournalEntry,
  GatewayTransportSummaryEntry,
} from "./types";

export function buildGatewayStateSnapshot(
  options: GatewayStateSnapshotInputs,
): GatewayStateSnapshot {
  const timestamp = options.now ?? new Date().toISOString();
  const {
    platformSummary,
    transportOverviewDetails,
    transportSummaries,
    transportJournal,
  } = buildGatewaySnapshotPlatformViews({
    readiness: options.readiness,
    platformStates: options.platformStates,
    controlPlane: options.controlPlane,
    allTraces: options.allTraces,
    inbox: options.inbox,
    outbox: options.outbox,
    attachments: options.attachments,
    timestamp,
  });
  const totalsView = buildGatewaySnapshotTotals({
    readiness: options.readiness,
    controlPlane: options.controlPlane,
    traces: options.traces,
    allTraces: options.allTraces,
    inbox: options.inbox,
    outbox: options.outbox,
    attachments: options.attachments,
    deliveries: options.deliveries,
    sessions: options.sessions,
    platformSummary,
    transportOverviewDetails,
  });

  return {
    running: options.running,
    updatedAt: timestamp,
    reason: options.reason,
    watchdogAt: options.watchdogAt,
    heartbeatAt: options.heartbeatAt,
    snapshotPath: options.snapshotPath,
    historyPath: options.historyPath,
    daemon: options.daemon,
    totals: totalsView.totals,
    platforms: platformSummary,
    transportOverview: totalsView.transportOverview,
    transportSummaries,
    transportJournal,
    tracesByKind: totalsView.tracesByKind,
    tracesByPlatform: totalsView.tracesByPlatform,
    inboxByPlatform: totalsView.inboxByPlatform,
    outboxByPlatform: totalsView.outboxByPlatform,
    attachmentsByPlatform: totalsView.attachmentsByPlatform,
    attachmentsByKind: totalsView.attachmentsByKind,
    deliveriesByPlatform: totalsView.deliveriesByPlatform,
    sessionsByPlatform: totalsView.sessionsByPlatform,
  };
}
