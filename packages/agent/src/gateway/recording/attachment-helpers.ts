import type { PlatformName } from "@/types/gateway";
import type { GatewayAttachmentRecord } from "../read/history-view";

export interface GatewayAttachmentSource {
  sessionId?: string;
  deliveryId?: string;
  messageId?: string;
  userId?: string;
  roomId: string;
  threadId?: string;
  replyToMessageId?: string;
  metadata: Record<string, string>;
}

export interface GatewayJournalAttachmentInput {
  direction: "inbox" | "outbox";
  platform: PlatformName;
  recordId: string;
  traceId: string;
  at?: string;
  source: GatewayAttachmentSource;
}

export function splitGatewayAttachmentList(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[|,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildGatewayJournalAttachments(
  input: GatewayJournalAttachmentInput,
): GatewayAttachmentRecord[] {
  const at = input.at ?? new Date().toISOString();
  const kinds = splitGatewayAttachmentList(
    input.source.metadata.attachmentKinds ??
      input.source.metadata.attachmentKind,
  );
  const names = splitGatewayAttachmentList(
    input.source.metadata.attachmentNames,
  );
  const urls = splitGatewayAttachmentList(input.source.metadata.attachmentUrls);
  const mimeTypes = splitGatewayAttachmentList(
    input.source.metadata.attachmentMimeTypes,
  );
  const sizes = splitGatewayAttachmentList(
    input.source.metadata.attachmentSizes,
  );
  const captions = splitGatewayAttachmentList(
    input.source.metadata.attachmentCaptions,
  );
  const durations = splitGatewayAttachmentList(
    input.source.metadata.attachmentDurationsMs,
  );
  const widths = splitGatewayAttachmentList(
    input.source.metadata.attachmentWidths,
  );
  const heights = splitGatewayAttachmentList(
    input.source.metadata.attachmentHeights,
  );
  const count = Math.max(
    Number(input.source.metadata.attachmentCount ?? "0") || 0,
    kinds.length,
    names.length,
    urls.length,
    mimeTypes.length,
  );

  return Array.from({ length: count }).map((_, index) => {
    const attachmentKind =
      kinds[index] ??
      names[index] ??
      input.source.metadata.attachmentType ??
      "attachment";

    return {
      attachmentId: `${input.recordId}:${index + 1}`,
      recordId: input.recordId,
      at,
      direction: input.direction,
      platform: input.platform,
      sessionId: input.source.sessionId,
      traceId: input.traceId,
      deliveryId: input.source.deliveryId,
      messageId: input.source.messageId,
      userId: input.source.userId,
      roomId: input.source.roomId,
      threadId: input.source.threadId,
      replyToMessageId: input.source.replyToMessageId,
      kind: attachmentKind,
      name: names[index] ?? input.source.metadata.attachmentName,
      url: urls[index] ?? input.source.metadata.attachmentUrl,
      mimeType: mimeTypes[index] ?? input.source.metadata.attachmentMimeType,
      size: sizes[index] ?? input.source.metadata.attachmentSize,
      caption: captions[index] ?? input.source.metadata.attachmentCaption,
      durationMs:
        durations[index] ?? input.source.metadata.attachmentDurationMs,
      width: widths[index] ?? input.source.metadata.attachmentWidth,
      height: heights[index] ?? input.source.metadata.attachmentHeight,
      metadataKeys: Object.keys(input.source.metadata),
      metadata: input.source.metadata,
    };
  });
}
