import type { PlatformName, SessionRoute } from "@/types/gateway";
import type {
  DeliveredMessageRecord,
  GatewayAttachmentRecord,
  GatewayHistoryWindow,
  GatewayInboxRecord,
  GatewayOutboxRecord,
  GatewayTraceRecord,
} from "./types";
import {
  resolveRecentDeliveries as buildRecentDeliveries,
  resolveRecentSessions as buildRecentSessions,
  buildRecentWindow,
} from "./window";

export function buildHistoryWindow(
  allTraces: GatewayTraceRecord[],
  inbox: GatewayInboxRecord[],
  outbox: GatewayOutboxRecord[],
  attachments: GatewayAttachmentRecord[],
  deliveries: (limit: number) => DeliveredMessageRecord[],
  sessions: readonly SessionRoute[],
  limit: number,
  platform?: PlatformName,
): GatewayHistoryWindow {
  return {
    allTraces,
    traces: buildRecentWindow(allTraces, limit),
    inbox: buildRecentWindow(inbox, limit),
    outbox: buildRecentWindow(outbox, limit),
    attachments: buildRecentWindow(attachments, limit),
    deliveries: buildRecentDeliveries(deliveries, limit, platform),
    sessions: buildRecentSessions(sessions, limit, platform),
  };
}
