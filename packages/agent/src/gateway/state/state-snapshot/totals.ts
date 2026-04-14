import type { GatewayPlatformStateView } from "../../read/platform-state-view";
import {
  countByKind,
  countByPlatform,
  countByString,
} from "../../trace-summary";
import type {
  GatewayStateSnapshot,
  GatewayStateSnapshotInputs,
  GatewayTransportDetail,
} from "./types";

interface BuildGatewaySnapshotTotalsArgs
  extends Pick<
    GatewayStateSnapshotInputs,
    | "allTraces"
    | "attachments"
    | "controlPlane"
    | "deliveries"
    | "inbox"
    | "outbox"
    | "readiness"
    | "sessions"
    | "traces"
  > {
  platformSummary: GatewayPlatformStateView[];
  transportOverviewDetails: GatewayTransportDetail[];
}

export interface GatewaySnapshotTotalsView {
  totals: GatewayStateSnapshot["totals"];
  transportOverview: GatewayStateSnapshot["transportOverview"];
  tracesByKind: GatewayStateSnapshot["tracesByKind"];
  tracesByPlatform: GatewayStateSnapshot["tracesByPlatform"];
  inboxByPlatform: GatewayStateSnapshot["inboxByPlatform"];
  outboxByPlatform: GatewayStateSnapshot["outboxByPlatform"];
  attachmentsByPlatform: GatewayStateSnapshot["attachmentsByPlatform"];
  attachmentsByKind: GatewayStateSnapshot["attachmentsByKind"];
  deliveriesByPlatform: GatewayStateSnapshot["deliveriesByPlatform"];
  sessionsByPlatform: GatewayStateSnapshot["sessionsByPlatform"];
}

export function buildGatewaySnapshotTotals(
  args: BuildGatewaySnapshotTotalsArgs,
): GatewaySnapshotTotalsView {
  return {
    totals: {
      configuredPlatforms: args.readiness.length,
      activeAdapters: args.readiness.filter(
        (entry) => entry.status === "running",
      ).length,
      readyAdapters: args.readiness.filter((entry) => entry.ready).length,
      gatewayEnabledTransports: args.controlPlane.totals.gatewayEnabled,
      operationalTransports: args.controlPlane.totals.operationalTransports,
      nativeAdapters: args.readiness.filter((entry) => entry.mode === "native")
        .length,
      mockAdapters: args.readiness.filter((entry) => entry.mode === "mock")
        .length,
      pluginMediatedAdapters: args.platformSummary.filter((entry) =>
        Boolean(entry.nativePluginId),
      ).length,
      officialPluginAdapters: args.platformSummary.filter(
        (entry) => entry.nativePluginSource === "official",
      ).length,
      vendoredPluginAdapters: args.platformSummary.filter(
        (entry) => entry.nativePluginSource === "vendored",
      ).length,
      totalTraces: args.allTraces.length,
      recentTraces: args.traces.length,
      inboxMessages: args.inbox.length,
      outboxMessages: args.outbox.length,
      attachmentRecords: args.attachments.length,
      recentDeliveries: args.deliveries.length,
      recentSessions: args.sessions.length,
    },
    transportOverview: {
      mismatchCount: args.transportOverviewDetails.filter(
        (entry) => entry.mismatchFlags.length > 0,
      ).length,
      operationalCount: args.transportOverviewDetails.filter(
        (entry) => entry.inventory?.operational,
      ).length,
      details: args.transportOverviewDetails,
    },
    tracesByKind: countByKind(args.allTraces, (trace) => trace.kind),
    tracesByPlatform: countByPlatform(
      args.allTraces,
      (trace) => trace.platform,
    ),
    inboxByPlatform: countByPlatform(args.inbox, (record) => record.platform),
    outboxByPlatform: countByPlatform(args.outbox, (record) => record.platform),
    attachmentsByPlatform: countByPlatform(
      args.attachments,
      (record) => record.platform,
    ),
    attachmentsByKind: countByString(args.attachments, (record) => record.kind),
    deliveriesByPlatform: countByPlatform(
      args.deliveries,
      (delivery) => delivery.target.platform,
    ),
    sessionsByPlatform: countByPlatform(
      args.sessions,
      (session) => session.platform,
    ),
  };
}
