import type { IncomingPlatformMessage } from "@/types/gateway";
import {
  type AttachmentDescriptor,
  attachmentMetadata,
  normalizeMetadata,
} from "./helpers";
import { buildMimeAttachment, optionalNumericString } from "./parser-utils";

export function parseWhatsAppMessage(
  body: unknown,
): IncomingPlatformMessage | null {
  const payload = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            id?: string;
            from?: string;
            timestamp?: string;
            context?: { id?: string };
            text?: { body?: string };
            image?: {
              caption?: string;
              mime_type?: string;
              id?: string;
              sha256?: string;
            };
            video?: {
              caption?: string;
              mime_type?: string;
              id?: string;
              sha256?: string;
            };
            audio?: { mime_type?: string; id?: string; sha256?: string };
            document?: {
              filename?: string;
              mime_type?: string;
              id?: string;
              sha256?: string;
            };
            sticker?: { id?: string; sha256?: string };
          }>;
        };
      }>;
    }>;
  };

  const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message?.from || !message.text?.body) {
    return null;
  }

  const attachments: AttachmentDescriptor[] = [];
  if (message.image?.id) {
    attachments.push({
      kind: "image",
      name:
        message.image.caption ?? `whatsapp-image-${message.id ?? "unknown"}`,
      url: message.image.id,
      mimeType: message.image.mime_type,
    });
  }
  if (message.video?.id) {
    attachments.push({
      kind: "video",
      name:
        message.video.caption ?? `whatsapp-video-${message.id ?? "unknown"}`,
      url: message.video.id,
      mimeType: message.video.mime_type,
    });
  }
  if (message.audio?.id) {
    attachments.push({
      kind: "audio",
      name: `whatsapp-audio-${message.id ?? "unknown"}`,
      url: message.audio.id,
      mimeType: message.audio.mime_type,
    });
  }
  if (message.document?.id) {
    attachments.push({
      kind: "document",
      name:
        message.document.filename ??
        `whatsapp-document-${message.id ?? "unknown"}`,
      url: message.document.id,
      mimeType: message.document.mime_type,
    });
  }
  if (message.sticker?.id) {
    attachments.push({
      kind: "sticker",
      name: `whatsapp-sticker-${message.id ?? "unknown"}`,
      url: message.sticker.id,
      mimeType: "image/webp",
    });
  }

  return {
    platform: "whatsapp",
    userId: message.from,
    roomId: message.from,
    text: message.text.body,
    channelId: message.from,
    messageId: message.id,
    replyToMessageId: message.context?.id,
    timestamp: message.timestamp,
    metadata: normalizeMetadata([
      ["replyToId", message.context?.id],
      ["messageId", message.id],
      ["timestamp", message.timestamp],
      ...Object.entries(attachmentMetadata(attachments)),
    ]),
  };
}

function matrixAttachmentKind(msgtype?: string): AttachmentDescriptor["kind"] {
  if (msgtype === "m.image") {
    return "image";
  }
  if (msgtype === "m.video") {
    return "video";
  }
  if (msgtype === "m.audio") {
    return "audio";
  }
  return "file";
}

export function parseMatrixMessage(
  body: unknown,
): IncomingPlatformMessage | null {
  const payload = body as {
    sender?: string;
    room_id?: string;
    body?: string;
    content?: { body?: string };
    event_id?: string;
    relates_to?: { event_id?: string };
    timestamp?: string;
    url?: string;
    info?: { mimetype?: string; size?: number; h?: number; w?: number };
    filename?: string;
    msgtype?: string;
  };

  const text = payload.body ?? payload.content?.body;
  if (!text || !payload.sender || !payload.room_id) {
    return null;
  }

  const attachments: AttachmentDescriptor[] = [];
  const attachment = buildMimeAttachment({
    kind: matrixAttachmentKind(payload.msgtype),
    name: payload.filename ?? payload.event_id ?? "matrix-attachment",
    url: payload.url,
    mimeType: payload.info?.mimetype,
    size: payload.info?.size,
    width: payload.info?.w,
    height: payload.info?.h,
  });
  if (attachment) {
    attachments.push({
      ...attachment,
      size: optionalNumericString(payload.info?.size),
      width: optionalNumericString(payload.info?.w),
      height: optionalNumericString(payload.info?.h),
    });
  }

  return {
    platform: "matrix",
    userId: payload.sender,
    roomId: payload.room_id,
    text,
    channelId: payload.room_id,
    messageId: payload.event_id,
    replyToMessageId: payload.relates_to?.event_id,
    timestamp: payload.timestamp,
    metadata: normalizeMetadata([
      ["transport", "matrix"],
      ["messageId", payload.event_id],
      ["replyToMessageId", payload.relates_to?.event_id],
      ...Object.entries(attachmentMetadata(attachments)),
    ]),
  };
}
