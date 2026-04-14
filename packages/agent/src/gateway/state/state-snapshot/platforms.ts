import type { PlatformName } from "@/types/gateway";
import {
  buildPlatformStateFromSnapshot,
  createGatewayPlatformStateView,
  type GatewayPlatformStateView,
} from "../../read/platform-state-view";
import {
  buildGatewayTransportDetail,
  buildGatewayTransportJournalEntry,
  buildGatewayTransportSummaryEntry,
} from "../../read/transport-detail";
import type {
  GatewayStateSnapshotInputs,
  GatewayTransportDetail,
  GatewayTransportJournalEntry,
  GatewayTransportSummaryEntry,
} from "./types";

export interface GatewaySnapshotPlatformViews {
  platformSummary: GatewayPlatformStateView[];
  transportOverviewDetails: GatewayTransportDetail[];
  transportSummaries: GatewayTransportSummaryEntry[];
  transportJournal: GatewayTransportJournalEntry[];
}

interface BuildGatewaySnapshotPlatformViewsArgs
  extends Pick<
    GatewayStateSnapshotInputs,
    | "attachments"
    | "allTraces"
    | "controlPlane"
    | "inbox"
    | "outbox"
    | "platformStates"
    | "readiness"
  > {
  timestamp: string;
}

export function buildGatewaySnapshotPlatformViews(
  args: BuildGatewaySnapshotPlatformViewsArgs,
): GatewaySnapshotPlatformViews {
  const readinessByPlatform = new Map(
    args.readiness.map((entry) => [entry.platform, entry] as const),
  );
  const getPlatformState = (platform: PlatformName): GatewayPlatformStateView =>
    args.platformStates.get(platform) ??
    createGatewayPlatformStateView(platform);

  const platformSummary = args.readiness.map((entry) =>
    buildPlatformStateFromSnapshot({
      platform: entry.platform,
      readiness: entry,
      platformState: getPlatformState(entry.platform),
      allTraces: args.allTraces,
      inbox: args.inbox,
      outbox: args.outbox,
      attachments: args.attachments,
      now: args.timestamp,
    }),
  );
  const transportOverviewDetails = platformSummary.map((entry) =>
    buildGatewayTransportDetail({
      platform: entry.platform,
      controlPlane: args.controlPlane,
      platformState: getPlatformState(entry.platform),
      readiness: readinessByPlatform.get(entry.platform),
      traces: args.allTraces,
      inbox: args.inbox,
      outbox: args.outbox,
      attachments: args.attachments,
      recentLimit: 20,
      includeHealthMismatch: false,
    }),
  );

  return {
    platformSummary,
    transportOverviewDetails,
    transportSummaries: transportOverviewDetails.map(
      buildGatewayTransportSummaryEntry,
    ),
    transportJournal: transportOverviewDetails.map(
      buildGatewayTransportJournalEntry,
    ),
  };
}
