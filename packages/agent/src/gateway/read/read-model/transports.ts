import type { PlatformName } from "@/types/gateway";
import type { GatewayTransportDetail } from "../../state/state-snapshot";
import { buildGatewayTransportDetail } from "../transport-detail";
import { readGatewayHealth, readGatewayState } from "./snapshots";
import type {
  GatewayRunnerReadModelDeps,
  GatewayTransportOverview,
} from "./types";

type GatewayTransportReadDeps = Pick<
  GatewayRunnerReadModelDeps,
  | "attachmentLog"
  | "getNativeMessagingState"
  | "getTransportControlPlane"
  | "inboxLog"
  | "outboxLog"
  | "snapshotState"
  | "traceLog"
>;

export async function readGatewayTransportDetail(
  deps: GatewayTransportReadDeps,
  platform: PlatformName,
): Promise<GatewayTransportDetail> {
  const controlPlane = deps.getTransportControlPlane();
  const readiness = (await readGatewayHealth(deps.snapshotState)).find(
    (entry) => entry.platform === platform,
  );
  const state = await readGatewayState(deps.snapshotState, 100, { platform });
  const platformState = state.platforms.find(
    (entry) => entry.platform === platform,
  );

  return buildGatewayTransportDetail({
    platform,
    controlPlane,
    platformState,
    readiness,
    traces: deps.traceLog,
    inbox: deps.inboxLog,
    outbox: deps.outboxLog,
    attachments: deps.attachmentLog,
    nativeMessagingState: deps.getNativeMessagingState(platform),
    includeHealthMismatch: true,
    recentLimit: 20,
    countFromRecent: true,
  });
}

export async function readGatewayTransportOverview(
  platforms: readonly PlatformName[],
  readTransport: (platform: PlatformName) => Promise<GatewayTransportDetail>,
): Promise<GatewayTransportOverview> {
  const details = await Promise.all(
    platforms.map((platform) => readTransport(platform)),
  );
  return summarizeGatewayTransportOverview(details);
}

function summarizeGatewayTransportOverview(
  details: GatewayTransportDetail[],
): GatewayTransportOverview {
  return {
    details,
    mismatchCount: details.filter((entry) => entry.mismatchFlags.length > 0)
      .length,
    operationalCount: details.filter((entry) => entry.inventory?.operational)
      .length,
  };
}
