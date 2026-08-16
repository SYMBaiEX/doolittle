import type { AppContext } from "@/runtime/bootstrap";
import type { RunUpdateEvent } from "@/services/run-controller-service";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  OutboundPlatformMessage,
  PlatformName,
} from "@/types/gateway";
import type { PlatformAdapter } from "../platforms/base";
import type {
  GatewayInboxRecord,
  GatewayOutboxRecord,
} from "../read/history-view";
import type { GatewayReceiveOutcome } from "./outcome-types";

export interface GatewayReceiveResult extends GatewayReceiveOutcome {}

export interface GatewayRuntimeContext {
  config: AppContext["config"];
  runtime: AppContext["runtime"];
  services: AppContext["services"];
}

export interface GatewayReceiveOptions {
  /** Cancels provider and tool execution when the initiating transport closes. */
  abortSignal?: AbortSignal;
  /** Internal ingress-only signal; never serialize this on public responses. */
  preserveIdempotencyDisposition?: boolean;
  onResponseProgress?: (update: {
    chunk: string;
    response: string;
    phase: "command" | "readiness" | "model";
  }) => void | Promise<void>;
  onRunUpdate?: (event: RunUpdateEvent) => void | Promise<void>;
}

export interface GatewayReceiveDependencies {
  context: GatewayRuntimeContext;
  message: IncomingPlatformMessage;
  adapter?: PlatformAdapter;
  recordInbox: (
    message: IncomingPlatformMessage,
    traceId: string,
    sessionId?: string,
    status?: GatewayInboxRecord["status"],
    notes?: string[],
  ) => GatewayInboxRecord;
  recordOutbox: (
    platform: PlatformName,
    traceId: string,
    sessionId: string | undefined,
    delivery: DeliveredMessageRecord | undefined,
    message: OutboundPlatformMessage,
    status: GatewayOutboxRecord["status"],
    notes?: string[],
    attemptedDeliveryId?: string,
  ) => GatewayOutboxRecord;
  pushTrace: (entry: {
    traceId: string;
    at: string;
    kind:
      | "receive"
      | "authorize"
      | "session"
      | "route"
      | "respond"
      | "deliver"
      | "reject";
    platform: PlatformName | "gateway";
    detail: string;
    userId?: string;
    roomId?: string;
    messageId?: string;
    threadId?: string;
    replyToMessageId?: string;
    sessionId?: string;
    deliveryId?: string;
    metadataKeys?: string[];
  }) => void;
  observeAdapter: (
    platform: PlatformName,
    event: {
      at: string;
      kind:
        | "start"
        | "stop"
        | "heartbeat"
        | "receive"
        | "authorize"
        | "route"
        | "respond"
        | "deliver"
        | "reject"
        | "edit";
      detail: string;
    },
  ) => Promise<void>;
  editDelivery: (
    deliveryId: string,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ) => Promise<DeliveredMessageRecord>;
  snapshotState: (reason: string, limit?: number) => Promise<unknown>;
}
