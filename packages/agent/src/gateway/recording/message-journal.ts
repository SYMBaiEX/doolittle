import { randomUUID } from "node:crypto";
import type {
  DeliveredMessageRecord,
  IncomingPlatformMessage,
  OutboundPlatformMessage,
  PlatformName,
} from "@/types/gateway";
import type {
  GatewayAttachmentRecord,
  GatewayInboxRecord,
  GatewayOutboxRecord,
} from "../read/history-view";
import {
  buildGatewayJournalAttachments,
  splitGatewayAttachmentList,
} from "./attachment-helpers";
import { appendGatewayJournalRecord } from "./journal";

interface GatewayRecordJournalArgs<TRecord extends { at: string }> {
  recordLog: TRecord[];
  recordPath: string;
  attachmentLog: GatewayAttachmentRecord[];
  attachmentsPath: string;
}

interface GatewayInboxJournalArgs
  extends GatewayRecordJournalArgs<GatewayInboxRecord> {
  at?: string;
  traceId: string;
  sessionId?: string;
  message: IncomingPlatformMessage;
  status?: GatewayInboxRecord["status"];
  notes?: string[];
}

interface GatewayOutboxJournalArgs
  extends GatewayRecordJournalArgs<GatewayOutboxRecord> {
  at?: string;
  platform: PlatformName;
  traceId: string;
  sessionId?: string;
  delivery: DeliveredMessageRecord;
  message: OutboundPlatformMessage;
  status: GatewayOutboxRecord["status"];
}

interface GatewayJournalResult<TRecord extends { at: string }> {
  record: TRecord;
  attachments: GatewayAttachmentRecord[];
}

function buildGatewayAttachmentSummary(metadata?: Record<string, string>) {
  const resolvedMetadata = metadata ?? {};
  return {
    attachmentCount: Number(resolvedMetadata.attachmentCount ?? "0") || 0,
    attachmentKinds: splitGatewayAttachmentList(
      resolvedMetadata.attachmentKinds,
    ),
    attachmentNames: splitGatewayAttachmentList(
      resolvedMetadata.attachmentNames,
    ),
    attachmentUrls: splitGatewayAttachmentList(resolvedMetadata.attachmentUrls),
    attachmentMimeTypes: splitGatewayAttachmentList(
      resolvedMetadata.attachmentMimeTypes,
    ),
    metadataKeys: Object.keys(resolvedMetadata),
    metadata: resolvedMetadata,
  };
}

function appendGatewayAttachments(args: {
  attachments: GatewayAttachmentRecord[];
  attachmentLog: GatewayAttachmentRecord[];
  attachmentsPath: string;
}): void {
  for (const attachment of args.attachments) {
    args.attachmentLog.push(attachment);
    appendGatewayJournalRecord(args.attachmentsPath, attachment);
  }
}

export function recordGatewayInboxJournalEntry(
  args: GatewayInboxJournalArgs,
): GatewayJournalResult<GatewayInboxRecord> {
  const at = args.at ?? new Date().toISOString();
  const record: GatewayInboxRecord = {
    recordId: randomUUID(),
    at,
    platform: args.message.platform,
    sessionId: args.sessionId,
    traceId: args.traceId,
    status: args.status ?? "received",
    userId: args.message.userId,
    roomId: args.message.roomId,
    channelId: args.message.channelId,
    threadId: args.message.threadId,
    messageId: args.message.messageId,
    replyToMessageId: args.message.replyToMessageId,
    channelType: args.message.channelType,
    authorName: args.message.authorName,
    textPreview: args.message.text.slice(0, 280),
    ...buildGatewayAttachmentSummary(args.message.metadata),
    notes: args.notes?.length ? args.notes : undefined,
  };
  args.recordLog.push(record);
  appendGatewayJournalRecord(args.recordPath, record);

  const attachments = buildGatewayJournalAttachments({
    direction: "inbox",
    platform: args.message.platform,
    recordId: record.recordId,
    traceId: args.traceId,
    at: record.at,
    source: {
      sessionId: args.sessionId,
      messageId: args.message.messageId,
      userId: args.message.userId,
      roomId: args.message.roomId,
      threadId: args.message.threadId,
      replyToMessageId: args.message.replyToMessageId,
      metadata: record.metadata,
    },
  });
  appendGatewayAttachments({
    attachments,
    attachmentLog: args.attachmentLog,
    attachmentsPath: args.attachmentsPath,
  });

  return { record, attachments };
}

export function recordGatewayOutboxJournalEntry(
  args: GatewayOutboxJournalArgs,
): GatewayJournalResult<GatewayOutboxRecord> {
  const at = args.at ?? new Date().toISOString();
  const record: GatewayOutboxRecord = {
    recordId: randomUUID(),
    at,
    platform: args.platform,
    sessionId: args.sessionId,
    traceId: args.traceId,
    status: args.status,
    deliveryId: args.delivery.id,
    userId: args.message.userId,
    roomId: args.message.roomId,
    threadId: args.message.threadId,
    replyToMessageId: args.message.replyToId,
    textPreview: args.message.text.slice(0, 280),
    ...buildGatewayAttachmentSummary(args.message.metadata),
  };
  args.recordLog.push(record);
  appendGatewayJournalRecord(args.recordPath, record);

  const attachments = buildGatewayJournalAttachments({
    direction: "outbox",
    platform: args.platform,
    recordId: record.recordId,
    traceId: args.traceId,
    at: record.at,
    source: {
      sessionId: args.sessionId,
      deliveryId: args.delivery.id,
      userId: args.message.userId,
      roomId: args.message.roomId,
      threadId: args.message.threadId,
      replyToMessageId: args.message.replyToId,
      metadata: record.metadata,
    },
  });
  appendGatewayAttachments({
    attachments,
    attachmentLog: args.attachmentLog,
    attachmentsPath: args.attachmentsPath,
  });

  return { record, attachments };
}
