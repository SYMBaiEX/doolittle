import type { IncomingPlatformMessage } from "@/types/gateway";
import { attachmentMetadata, normalizeMetadata } from "./helpers";
import { buildMimeAttachment } from "./parser-utils";

export function parseDiscordMessage(
  body: unknown,
): IncomingPlatformMessage | null {
  const payload = body as {
    content?: string;
    channel_id?: string;
    id?: string;
    author?: { id?: string; username?: string; bot?: boolean };
    message_reference?: { message_id?: string };
    guild_id?: string;
    type?: number;
    thread_id?: string;
    attachments?: Array<{
      id?: string;
      filename?: string;
      url?: string;
      proxy_url?: string;
      content_type?: string;
      size?: number;
      height?: number;
      width?: number;
    }>;
  };

  if (
    !payload.content ||
    !payload.channel_id ||
    !payload.author?.id ||
    payload.author.bot
  ) {
    return null;
  }

  const attachments = (payload.attachments ?? []).flatMap((attachment) => {
    const descriptor = buildMimeAttachment({
      name: attachment.filename ?? attachment.id,
      url: attachment.url ?? attachment.proxy_url,
      mimeType: attachment.content_type,
      size: attachment.size,
      width: attachment.width,
      height: attachment.height,
    });
    return descriptor ? [descriptor] : [];
  });

  return {
    platform: "discord",
    userId: payload.author.id,
    roomId: payload.channel_id,
    text: payload.content,
    channelId: payload.channel_id,
    messageId: payload.id,
    threadId: payload.thread_id ?? payload.message_reference?.message_id,
    replyToMessageId: payload.message_reference?.message_id,
    metadata: normalizeMetadata([
      ["authorUsername", payload.author.username],
      ["guildId", payload.guild_id],
      [
        "messageType",
        typeof payload.type === "number" ? String(payload.type) : undefined,
      ],
      ["threadId", payload.thread_id ?? payload.message_reference?.message_id],
      ["replyToMessageId", payload.message_reference?.message_id],
      ...Object.entries(attachmentMetadata(attachments)),
    ]),
  };
}

export function parseSlackMessage(
  body: unknown,
): IncomingPlatformMessage | null {
  const payload = body as {
    challenge?: string;
    event?: {
      type?: string;
      subtype?: string;
      text?: string;
      channel?: string;
      user?: string;
      ts?: string;
      thread_ts?: string;
      channel_type?: string;
      files?: Array<{
        id?: string;
        name?: string;
        url_private?: string;
        mimetype?: string;
        size?: number;
      }>;
    };
  };

  if (
    payload.event?.type !== "message" ||
    payload.event.subtype === "bot_message" ||
    !payload.event.text ||
    !payload.event.channel ||
    !payload.event.user
  ) {
    return null;
  }

  const attachments = (payload.event.files ?? []).flatMap((file) => {
    const descriptor = buildMimeAttachment({
      name: file.name ?? file.id,
      url: file.url_private,
      mimeType: file.mimetype,
      size: file.size,
    });
    return descriptor ? [descriptor] : [];
  });

  return {
    platform: "slack",
    userId: payload.event.user,
    roomId: payload.event.channel,
    text: payload.event.text,
    channelId: payload.event.channel,
    messageId: payload.event.ts,
    threadId: payload.event.thread_ts,
    channelType: payload.event.channel_type,
    metadata: normalizeMetadata([
      ["eventType", payload.event.type],
      ["subtype", payload.event.subtype],
      ["channelType", payload.event.channel_type],
      ["threadTs", payload.event.thread_ts],
      ["messageId", payload.event.ts],
      ...Object.entries(attachmentMetadata(attachments)),
    ]),
  };
}

export function parseSignalMessage(
  body: unknown,
): IncomingPlatformMessage | null {
  const payload = body as {
    sender?: string;
    from?: string;
    conversation_id?: string;
    thread_id?: string;
    message?: string;
    text?: string;
    body?: string;
    timestamp?: string;
    reply_to?: string;
    message_id?: string;
    attachments?: Array<{
      id?: string;
      filename?: string;
      content_type?: string;
      url?: string;
      data?: string;
      size?: number;
    }>;
  };

  const text = payload.text ?? payload.message ?? payload.body;
  const userId = payload.sender ?? payload.from;
  const roomId = payload.conversation_id ?? payload.sender ?? payload.from;
  if (!text || !userId || !roomId) {
    return null;
  }

  const attachments = (payload.attachments ?? []).flatMap((attachment) => {
    const descriptor = buildMimeAttachment({
      name: attachment.filename ?? attachment.id,
      url: attachment.url ?? attachment.data,
      mimeType: attachment.content_type,
      size: attachment.size,
    });
    return descriptor ? [descriptor] : [];
  });

  return {
    platform: "signal",
    userId,
    roomId,
    text,
    channelId: roomId,
    threadId: payload.thread_id ?? payload.reply_to,
    messageId: payload.message_id,
    replyToMessageId: payload.reply_to,
    timestamp: payload.timestamp,
    metadata: normalizeMetadata([
      ["transport", "signal"],
      ["threadId", payload.thread_id ?? payload.reply_to],
      ["replyToMessageId", payload.reply_to],
      ["messageId", payload.message_id],
      ...Object.entries(attachmentMetadata(attachments)),
    ]),
  };
}
