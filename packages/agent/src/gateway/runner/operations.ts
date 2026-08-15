import { randomUUID } from "node:crypto";
import {
  buildGatewayOutboundForSession,
  buildGatewayOutboundMessageFromDelivery,
} from "@/gateway/outbound/builders";
import {
  editDeliveryOutbound,
  type GatewayEditDeliveryDependencies,
  type GatewayProgressiveDeliveryDependencies,
  type GatewaySendToHomesDependencies,
  sendProgressiveOutbound,
  sendToHomesOutbound,
} from "@/gateway/outbound/dispatch";
import { sanitizeGatewayDeliveryFailure } from "@/gateway/receive/delivery";
import { GatewayReceiveIdempotencyCoordinator } from "@/gateway/receive/idempotency";
import type {
  GatewayReceiveOptions,
  GatewayReceiveResult,
} from "@/gateway/receive/index";
import { processGatewayReceive } from "@/gateway/receive/index";
import type { GatewayRunnerContext } from "@/gateway/runner/context";
import type { GatewayRunnerRecording } from "@/gateway/runner/recording";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  PlatformName,
} from "@/types/gateway";
import type {
  PlatformAdapter,
  PlatformLifecycleEvent,
} from "../platforms/base";

export interface GatewayRunnerOperationDependencies {
  context: GatewayRunnerContext;
  adapters: Map<PlatformName, PlatformAdapter>;
  recording: GatewayRunnerRecording;
  snapshotState: (reason: string, limit?: number) => Promise<unknown>;
  observeAdapter: (
    platform: PlatformName,
    event: PlatformLifecycleEvent,
  ) => Promise<void>;
  getOutboxSessionIdByDeliveryId: (deliveryId: string) => string | undefined;
}

export type GatewayDeliveryRetryErrorCode =
  | "adapter_unavailable"
  | "already_completed"
  | "delivery_failed"
  | "not_found";

export class GatewayDeliveryRetryError extends Error {
  constructor(
    public readonly code: GatewayDeliveryRetryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GatewayDeliveryRetryError";
  }
}

export interface GatewayRunnerOperations {
  observeAdapter(
    platform: PlatformName,
    event: PlatformLifecycleEvent,
  ): Promise<void>;
  receive(
    message: IncomingPlatformMessage,
    options?: GatewayReceiveOptions,
  ): Promise<GatewayReceiveResult>;
  retryDelivery(recordId: string): Promise<DeliveredMessageRecord>;
  sendToHomes(
    text: string,
    options?: {
      metadata?: Record<string, string>;
      platforms?: PlatformName[];
      name?: string;
    },
  ): Promise<DeliveredMessageRecord[]>;
  editDelivery(
    deliveryId: string,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ): Promise<DeliveredMessageRecord>;
  sendProgressive(
    target: {
      platform: PlatformName;
      roomId: string;
      userId?: string;
      threadId?: string;
      replyToId?: string;
      metadata?: Record<string, string>;
    },
    parts: string[],
  ): Promise<DeliveredMessageRecord>;
}

export function createGatewayRunnerOperations(
  deps: GatewayRunnerOperationDependencies,
): GatewayRunnerOperations {
  const editDelivery = (
    deliveryId: string,
    text: string,
    options?: {
      metadata?: Record<string, string>;
      threadId?: string;
      replyToId?: string;
    },
  ): Promise<DeliveredMessageRecord> => {
    const editDependencies: GatewayEditDeliveryDependencies = {
      getDelivery: (id) => deps.context.services.delivery.get(id),
      getOutboxSessionIdByDeliveryId: deps.getOutboxSessionIdByDeliveryId,
      getAdapter: (platform) => deps.adapters.get(platform),
      buildOutboundFromDelivery: (delivery, outboundText, outboundOptions) =>
        buildGatewayOutboundMessageFromDelivery(delivery, outboundText, {
          metadata: outboundOptions?.metadata,
          threadId: outboundOptions?.threadId,
          replyToId: outboundOptions?.replyToId,
        }),
      fallbackUpdate: (id, updateText, updateOptions) =>
        Promise.resolve(
          deps.context.services.delivery.update(id, updateText, {
            metadata: updateOptions?.metadata,
            threadId: updateOptions?.threadId,
            replyToId: updateOptions?.replyToId,
          }),
        ),
      recordOutbox: deps.recording.recordOutbox.bind(deps.recording),
      pushTrace: deps.recording.pushTrace.bind(deps.recording),
      observeAdapter: deps.observeAdapter,
      snapshotState: (reason, limit) =>
        deps.snapshotState(reason, limit) as Promise<unknown>,
    };

    return editDeliveryOutbound(deliveryId, text, options, editDependencies);
  };

  const receiveIdempotency = new GatewayReceiveIdempotencyCoordinator({
    findOutcome: (idempotencyKey) =>
      deps.recording.findReceiveOutcome(idempotencyKey),
    recordOutcome: (message, idempotencyKey, outcome) => {
      deps.recording.recordReceiveOutcome(message, idempotencyKey, outcome);
    },
  });

  const inFlightDeliveryRetries = new Map<
    string,
    Promise<DeliveredMessageRecord>
  >();

  const executeDeliveryRetry = async (
    recordId: string,
  ): Promise<DeliveredMessageRecord> => {
    const successfulRetry = deps.recording.getSuccessfulOutboxRetry(recordId);
    if (successfulRetry?.deliveryId) {
      const delivery = await deps.context.services.delivery.get(
        successfulRetry.deliveryId,
      );
      if (delivery) return delivery;
      throw new GatewayDeliveryRetryError(
        "already_completed",
        `Rejected outbox record ${recordId} was already retried as delivery ${successfulRetry.deliveryId}.`,
      );
    }
    const record = deps.recording.getOutboxRecord(recordId);
    if (record?.status !== "rejected" || !record.outbound) {
      throw new GatewayDeliveryRetryError(
        "not_found",
        `Rejected outbox record ${recordId} was not found.`,
      );
    }
    const adapter = deps.adapters.get(record.platform);
    if (!adapter) {
      throw new GatewayDeliveryRetryError(
        "adapter_unavailable",
        `No live ${record.platform} adapter is available.`,
      );
    }
    const traceId = randomUUID();
    let delivery: DeliveredMessageRecord;
    try {
      delivery = await adapter.send(record.outbound);
    } catch (error) {
      const failureNote = sanitizeGatewayDeliveryFailure(error);
      deps.recording.recordOutbox(
        record.platform,
        traceId,
        record.sessionId,
        undefined,
        record.outbound,
        "rejected",
        [failureNote],
        undefined,
        recordId,
      );
      const [snapshotResult] = await Promise.allSettled([
        Promise.resolve().then(() =>
          deps.snapshotState("retry-delivery-rejected", 20),
        ),
      ]);
      if (snapshotResult?.status === "rejected") {
        deps.context.runtime.logger?.warn(
          {
            traceId,
            recordId,
            phase: "retry-delivery-rejected:snapshot",
            error: sanitizeGatewayDeliveryFailure(snapshotResult.reason),
          },
          "Gateway delivery retry side effect failed",
        );
      }
      throw new GatewayDeliveryRetryError("delivery_failed", failureNote);
    }

    deps.recording.recordOutbox(
      record.platform,
      traceId,
      record.sessionId,
      delivery,
      record.outbound,
      "sent",
      [],
      undefined,
      recordId,
    );
    deps.recording.pushTrace({
      traceId,
      at: new Date().toISOString(),
      kind: "deliver",
      platform: record.platform,
      detail: `Retried rejected outbox record ${recordId} as delivery ${delivery.id}.`,
      sessionId: record.sessionId,
      userId: record.outbound.userId,
      roomId: record.outbound.roomId,
      threadId: record.outbound.threadId,
      replyToMessageId: record.outbound.replyToId,
      deliveryId: delivery.id,
      metadataKeys: Object.keys(delivery.metadata ?? {}),
    });
    const sideEffects = await Promise.allSettled([
      Promise.resolve().then(() =>
        deps.observeAdapter(record.platform, {
          at: new Date().toISOString(),
          kind: "deliver",
          detail: `Retried rejected outbox record ${recordId} as delivery ${delivery.id}.`,
        }),
      ),
      Promise.resolve().then(() => deps.snapshotState("retry-delivery", 20)),
    ]);
    for (const [index, result] of sideEffects.entries()) {
      if (result.status !== "rejected") continue;
      deps.context.runtime.logger?.warn(
        {
          traceId,
          recordId,
          deliveryId: delivery.id,
          phase:
            index === 0 ? "retry-delivery:observe" : "retry-delivery:snapshot",
          error: sanitizeGatewayDeliveryFailure(result.reason),
        },
        "Gateway delivery retry side effect failed",
      );
    }
    return delivery;
  };

  const retryDelivery = (recordId: string): Promise<DeliveredMessageRecord> => {
    const active = inFlightDeliveryRetries.get(recordId);
    if (active) return active;
    const execution = executeDeliveryRetry(recordId).finally(() => {
      if (inFlightDeliveryRetries.get(recordId) === execution) {
        inFlightDeliveryRetries.delete(recordId);
      }
    });
    inFlightDeliveryRetries.set(recordId, execution);
    return execution;
  };

  return {
    observeAdapter: deps.observeAdapter,
    receive: (message, options) =>
      receiveIdempotency.receive(message, () =>
        processGatewayReceive(
          {
            context: deps.context,
            message,
            adapter: deps.adapters.get(message.platform),
            recordInbox: deps.recording.recordInbox.bind(deps.recording),
            recordOutbox: deps.recording.recordOutbox.bind(deps.recording),
            pushTrace: deps.recording.pushTrace.bind(deps.recording),
            observeAdapter: deps.observeAdapter,
            editDelivery,
            snapshotState: (reason, limit) =>
              deps.snapshotState(reason, limit) as Promise<unknown>,
          },
          options,
        ),
      ),
    retryDelivery,
    sendToHomes: (text, options) => {
      const sendDeps: GatewaySendToHomesDependencies = {
        listHomeSessions: (platformFilters) =>
          deps.context.services.gatewaySessions
            .list()
            .filter(
              (session) =>
                session.isHome &&
                (!platformFilters || platformFilters.has(session.platform)) &&
                (session.channelId ?? session.roomId),
            ),
        buildOutboundForSession: (session, outbound, speechName) =>
          buildGatewayOutboundForSession(
            deps.context.services.media,
            session,
            outbound,
            speechName,
          ),
        getAdapter: (platform) => deps.adapters.get(platform),
        fallbackDeliver: (target, text, extras) =>
          deps.context.services.delivery.deliver(target, text, extras),
        recordOutbox: deps.recording.recordOutbox.bind(deps.recording),
        pushTrace: deps.recording.pushTrace.bind(deps.recording),
      };
      return sendToHomesOutbound(text, options, sendDeps);
    },
    editDelivery,
    sendProgressive: (target, parts) => {
      const depsProgressive: GatewayProgressiveDeliveryDependencies = {
        getAdapter: (platform) => deps.adapters.get(platform),
        fallbackDeliver: (targetDelivery, text, extras) =>
          deps.context.services.delivery.deliver(targetDelivery, text, extras),
        recordOutbox: deps.recording.recordOutbox.bind(deps.recording),
        pushTrace: deps.recording.pushTrace.bind(deps.recording),
        editDelivery: (deliveryId, text, options) =>
          editDelivery(deliveryId, text, options),
      };
      return sendProgressiveOutbound(target, parts, depsProgressive);
    },
  };
}
