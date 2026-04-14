import type {
  GatewayTransportDetail,
  GatewayTransportJournalEntry,
  GatewayTransportSummaryEntry,
} from "../../state/state-snapshot";
import { summarizeTransportJournalEntry } from "../../trace-summary";

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
