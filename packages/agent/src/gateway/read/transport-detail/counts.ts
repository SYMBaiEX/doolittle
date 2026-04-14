import type { GatewayTransportDetail } from "../../state/state-snapshot";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "../history-view";

export type PlatformTransportCounts = Pick<
  GatewayTransportDetail,
  "traceCount" | "inboxCount" | "outboxCount" | "attachmentCount"
>;

export interface TransportCountOptions {
  traces: readonly GatewayTraceRecord[];
  inbox: readonly GatewayInboxRecord[];
  outbox: readonly GatewayOutboxRecord[];
  attachments: readonly GatewayAttachmentRecord[];
  countFromRecent?: boolean;
  recentTraces: readonly GatewayTraceRecord[];
  recentInbox: readonly GatewayInboxRecord[];
  recentOutbox: readonly GatewayOutboxRecord[];
  recentAttachments: readonly GatewayAttachmentRecord[];
}

export function getTransportCounts({
  traces,
  inbox,
  outbox,
  attachments,
  countFromRecent,
  recentTraces,
  recentInbox,
  recentOutbox,
  recentAttachments,
}: TransportCountOptions): PlatformTransportCounts {
  return {
    traceCount: countFromRecent ? recentTraces.length : traces.length,
    inboxCount: countFromRecent ? recentInbox.length : inbox.length,
    outboxCount: countFromRecent ? recentOutbox.length : outbox.length,
    attachmentCount: countFromRecent
      ? recentAttachments.length
      : attachments.length,
  };
}
