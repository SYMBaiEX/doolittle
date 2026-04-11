import type { PlatformName } from "@/types/gateway";
import type { PlatformHealth } from "../platforms/base";
import type { GatewayInboxRecord } from "../read/history-view";
import { summarizeTransportJournalEntry } from "../trace-summary";
import type { GatewayReceiveResult } from "./types";

export interface GatewayInboxReplayTransportDetail {
  platform: PlatformName;
  inventory?: {
    source?: string;
    operational?: boolean;
  };
  platformState?: {
    nativePluginSource?: string;
    transportState?: string;
    lastUpdatedAt?: string;
    lastTraceAt?: string;
    lastEventAt?: string;
  };
  readiness?: {
    ready: boolean;
    status?: PlatformHealth["status"];
  };
  traceCount: number;
  inboxCount: number;
  outboxCount: number;
  attachmentCount: number;
  mismatchFlags: string[];
}

export interface GatewayInboxReplayResult extends GatewayReceiveResult {
  transportSummary?: string;
  transportDetail?: GatewayInboxReplayTransportDetail;
}

export async function replayGatewayInboxRecord(params: {
  record: GatewayInboxRecord;
  receive: (message: {
    platform: PlatformName;
    userId: string;
    roomId: string;
    text: string;
    channelId?: string;
    threadId?: string;
    messageId?: string;
    replyToMessageId?: string;
    channelType?: string;
    authorName?: string;
    timestamp?: string;
    metadata?: Record<string, string>;
  }) => Promise<GatewayReceiveResult>;
  transport: (
    platform: PlatformName,
  ) => Promise<GatewayInboxReplayTransportDetail>;
}): Promise<GatewayInboxReplayResult> {
  const { record } = params;
  const result = await params.receive({
    platform: record.platform,
    userId: record.userId ?? "unknown",
    roomId: record.roomId,
    text: record.textPreview,
    channelId: record.channelId,
    threadId: record.threadId,
    messageId: record.messageId,
    replyToMessageId: record.replyToMessageId,
    channelType: record.channelType,
    authorName: record.authorName,
    timestamp: record.at,
    metadata: {
      ...(record.metadata ?? {}),
      replayedFromRecordId: record.recordId,
      replayedAt: new Date().toISOString(),
    },
  });
  const transportDetail = await params.transport(record.platform);
  const source =
    transportDetail.inventory?.source ??
    transportDetail.platformState?.nativePluginSource ??
    "custom";
  return {
    ...result,
    transportDetail,
    transportSummary: summarizeTransportJournalEntry(
      {
        platform: record.platform,
        source,
        operational: transportDetail.inventory?.operational ?? false,
        ready: transportDetail.readiness?.ready ?? false,
        transportState: transportDetail.platformState?.transportState,
        status: transportDetail.readiness?.status,
        traceCount: transportDetail.traceCount,
        inboxCount: transportDetail.inboxCount,
        outboxCount: transportDetail.outboxCount,
        attachmentCount: transportDetail.attachmentCount,
        mismatchFlags: transportDetail.mismatchFlags,
      },
      transportDetail.platformState?.lastUpdatedAt ??
        transportDetail.platformState?.lastTraceAt ??
        transportDetail.platformState?.lastEventAt,
    ),
  };
}
