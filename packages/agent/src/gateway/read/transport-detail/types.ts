import type { PlatformHealth } from "@/gateway/platforms/base";
import type { PlatformName } from "@/types/gateway";
import type {
  GatewayControlPlaneView,
  GatewayNativeMessagingStateView,
  GatewayPlatformStateView,
  GatewayTransportDetail,
  GatewayTransportJournalEntry,
  GatewayTransportSummaryEntry,
} from "../../state/state-snapshot";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "../history-view";

export interface GatewayTransportDetailContext {
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
}

export interface TransportRecordBucket<
  T extends { platform: PlatformName | "gateway" },
> {
  all: T[];
  recent: T[];
}

export interface TransportRecordBuckets {
  traces: TransportRecordBucket<GatewayTraceRecord>;
  inbox: TransportRecordBucket<GatewayInboxRecord>;
  outbox: TransportRecordBucket<GatewayOutboxRecord>;
  attachments: TransportRecordBucket<GatewayAttachmentRecord>;
}

export interface GatewayTransportSourceInput {
  inventorySource?: string | null;
  nativePluginSource?: string | null;
}

export type TransportBuildDetailResult = GatewayTransportDetail;
export type TransportSummaryBuilderResult = GatewayTransportSummaryEntry;
export type TransportJournalBuilderResult = GatewayTransportJournalEntry;
