import type { NativeMessagingTransportState } from "@/runtime/native/service-bridge/transport-control";
import type { DeliveryService } from "@/services/delivery-service";
import type {
  DeliveredMessageRecord,
  OutboundPlatformMessage,
  PlatformName,
} from "@/types/gateway";
import type { MessagingPlatformState } from "./messaging-state";
import {
  mergeMessagingMetadata,
  type ParsedMessagingResponse,
} from "./messaging-utils";

export function buildMessagingRunningDetail(
  state: MessagingPlatformState,
  configuredDetail: string,
  bridge?: NativeMessagingTransportState,
): string {
  if (bridge) {
    return `${bridge.summary}; ${bridge.detail}`;
  }

  return [configuredDetail, `Sends=${state.getSendCount()}.`].join(" ");
}

interface DeliverMessagingRecordOptions {
  delivery: DeliveryService;
  message: OutboundPlatformMessage;
  name: PlatformName;
  platformLabel: string;
  responseMetadata: ParsedMessagingResponse;
  state: MessagingPlatformState;
}

export function deliverMessagingRecord({
  delivery,
  message,
  name,
  platformLabel,
  responseMetadata,
  state,
}: DeliverMessagingRecordOptions): DeliveredMessageRecord {
  const record = delivery.deliver(
    {
      platform: name,
      channelId: message.roomId,
      userId: message.userId,
      mode: "explicit",
    },
    message.text,
    {
      threadId: message.threadId,
      replyToId: message.replyToId,
      metadata: mergeMessagingMetadata(message.metadata, responseMetadata),
    },
  );

  state.recordDelivery({
    kind: "deliver",
    message,
    record,
    detail: `${platformLabel} delivery ${record.id} to ${message.roomId}${message.threadId ? ` thread=${message.threadId}` : ""}${message.replyToId ? ` replyTo=${message.replyToId}` : ""}.`,
  });

  return record;
}

interface EditMessagingRecordOptions {
  delivery: DeliveryService;
  existingRecord: DeliveredMessageRecord;
  message: OutboundPlatformMessage;
  platformLabel: string;
  responseMetadata: ParsedMessagingResponse;
  state: MessagingPlatformState;
  locationLabel: string;
}

export function editMessagingRecord({
  delivery,
  existingRecord,
  message,
  platformLabel,
  responseMetadata,
  state,
  locationLabel,
}: EditMessagingRecordOptions): DeliveredMessageRecord {
  const updated = delivery.update(existingRecord.id, message.text, {
    threadId: message.threadId,
    replyToId: message.replyToId,
    metadata: mergeMessagingMetadata(
      {
        ...(existingRecord.metadata ?? {}),
        ...(message.metadata ?? {}),
      },
      responseMetadata,
    ),
  });

  state.recordDelivery({
    kind: "edit",
    message,
    record: updated,
    detail: `${platformLabel} delivery ${updated.id} edited in ${locationLabel}.`,
  });

  return updated;
}
