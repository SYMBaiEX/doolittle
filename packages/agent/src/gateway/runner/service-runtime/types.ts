import type {
  DeliveredMessageRecord,
  PlatformName,
} from "../../../types/gateway";
import type { GatewayTraceRecord } from "../../read/history-view/index";

export interface GatewayRunnerSendToHomesOptions {
  metadata?: Record<string, string>;
  platforms?: PlatformName[];
  name?: string;
}

export interface GatewayRunnerEditDeliveryOptions {
  metadata?: Record<string, string>;
  threadId?: string;
  replyToId?: string;
}

export interface GatewayRunnerProgressiveTarget {
  platform: PlatformName;
  roomId: string;
  userId?: string;
  threadId?: string;
  replyToId?: string;
  metadata?: Record<string, string>;
}

export type GatewayRunnerDeliveryRecord = DeliveredMessageRecord;

export type GatewayRunnerUpdateListener = (event: {
  kind: GatewayTraceRecord["kind"];
  platform: GatewayTraceRecord["platform"];
  detail: string;
}) => void;
