import type { IncomingPlatformMessage } from "@/types/gateway";
import {
  type AttachmentDescriptor,
  attachmentMedia,
  attachmentMetadata,
  normalizeMetadata,
} from "./helpers";
import {
  authorDisplayName,
  firstNonEmptyText,
  optionalDurationMs,
  optionalNumericString,
} from "./parser-utils";

export function parseTelegramMessage(
  body: unknown,
): IncomingPlatformMessage | null {
  const payload = body as {
    message?: {
      message_id?: number;
      text?: string;
      caption?: string;
      chat?: { id?: number | string; type?: string; title?: string };
      from?: {
        id?: number | string;
        username?: string;
        first_name?: string;
        last_name?: string;
      };
      reply_to_message?: { message_id?: number };
      message_thread_id?: number;
      is_topic_message?: boolean;
      date?: number;
      photo?: Array<{ file_id?: string; file_unique_id?: string }>;
      document?: {
        file_id?: string;
        file_name?: string;
        mime_type?: string;
        file_size?: number;
      };
      video?: {
        file_id?: string;
        mime_type?: string;
        file_name?: string;
        file_size?: number;
      };
      voice?: {
        file_id?: string;
        mime_type?: string;
        duration?: number;
        file_size?: number;
      };
      audio?: {
        file_id?: string;
        mime_type?: string;
        file_name?: string;
        duration?: number;
        file_size?: number;
      };
      animation?: {
        file_id?: string;
        mime_type?: string;
        file_name?: string;
        file_size?: number;
      };
      sticker?: { file_id?: string; emoji?: string; is_animated?: boolean };
    };
  };

  if (
    payload.message?.chat?.id === undefined ||
    payload.message.from?.id === undefined
  ) {
    return null;
  }

  const message = payload.message;
  const chat = message.chat;
  const from = message.from;
  if (!chat || !from) {
    return null;
  }
  const authorName = authorDisplayName(
    from.username,
    from.first_name,
    from.last_name,
  );

  const attachments: AttachmentDescriptor[] = [];
  const photo = message.photo?.at(-1);
  if (photo?.file_id) {
    attachments.push({
      id: photo.file_id,
      kind: "photo",
      name: `telegram-photo-${message.message_id ?? "unknown"}`,
      url: photo.file_id,
      mimeType: "image/jpeg",
    });
  }
  if (message.document?.file_id) {
    attachments.push({
      id: message.document.file_id,
      kind: "document",
      name:
        message.document.file_name ??
        `telegram-document-${message.message_id ?? "unknown"}`,
      url: message.document.file_id,
      mimeType: message.document.mime_type,
      size: optionalNumericString(message.document.file_size),
    });
  }
  if (message.video?.file_id) {
    attachments.push({
      id: message.video.file_id,
      kind: "video",
      name:
        message.video.file_name ??
        `telegram-video-${message.message_id ?? "unknown"}`,
      url: message.video.file_id,
      mimeType: message.video.mime_type,
      size: optionalNumericString(message.video.file_size),
    });
  }
  if (message.voice?.file_id) {
    attachments.push({
      id: message.voice.file_id,
      kind: "voice",
      name: `telegram-voice-${message.message_id ?? "unknown"}`,
      url: message.voice.file_id,
      mimeType: message.voice.mime_type,
      durationMs: optionalDurationMs(message.voice.duration),
      size: optionalNumericString(message.voice.file_size),
    });
  }
  if (message.audio?.file_id) {
    attachments.push({
      id: message.audio.file_id,
      kind: "audio",
      name:
        message.audio.file_name ??
        `telegram-audio-${message.message_id ?? "unknown"}`,
      url: message.audio.file_id,
      mimeType: message.audio.mime_type,
      durationMs: optionalDurationMs(message.audio.duration),
      size: optionalNumericString(message.audio.file_size),
    });
  }
  if (message.animation?.file_id) {
    attachments.push({
      id: message.animation.file_id,
      kind: "animation",
      name:
        message.animation.file_name ??
        `telegram-animation-${message.message_id ?? "unknown"}`,
      url: message.animation.file_id,
      mimeType: message.animation.mime_type,
      size: optionalNumericString(message.animation.file_size),
    });
  }
  if (message.sticker?.file_id) {
    attachments.push({
      id: message.sticker.file_id,
      kind: "sticker",
      name:
        message.sticker.emoji ??
        `telegram-sticker-${message.message_id ?? "unknown"}`,
      url: message.sticker.file_id,
      mimeType: message.sticker.is_animated
        ? "image/webp+animated"
        : "image/webp",
    });
  }

  const text =
    firstNonEmptyText(message.text, message.caption) ??
    (attachments.length > 0 ? "[Telegram attachment]" : "");
  if (!text) return null;
  const topicThreadId =
    message.is_topic_message && Number.isFinite(message.message_thread_id)
      ? String(message.message_thread_id)
      : undefined;

  return {
    platform: "telegram",
    userId: String(from.id),
    roomId: String(chat.id),
    text,
    channelId: String(chat.id),
    threadId: topicThreadId,
    messageId: message.message_id ? String(message.message_id) : undefined,
    replyToMessageId: message.reply_to_message?.message_id
      ? String(message.reply_to_message.message_id)
      : undefined,
    channelType: chat.type,
    authorName,
    timestamp: message.date
      ? new Date(message.date * 1000).toISOString()
      : undefined,
    metadata: normalizeMetadata([
      ["chatTitle", chat.title],
      ["chatType", chat.type],
      [
        "messageId",
        message.message_id ? String(message.message_id) : undefined,
      ],
      [
        "replyToMessageId",
        message.reply_to_message?.message_id
          ? String(message.reply_to_message.message_id)
          : undefined,
      ],
      ["authorName", authorName],
      ["isTopicMessage", topicThreadId ? "true" : undefined],
      ["messageThreadId", topicThreadId],
      ...Object.entries(attachmentMetadata(attachments)),
    ]),
    attachments: attachmentMedia("telegram", attachments),
  };
}
