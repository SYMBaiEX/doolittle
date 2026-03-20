import type { IncomingPlatformMessage, PlatformName } from "@/types";

function normalizeMetadata(entries: Array<[string, string | undefined | null]>): Record<string, string> {
  return Object.fromEntries(entries.filter(([, value]) => Boolean(value))) as Record<string, string>;
}

export function normalizeInboundMessage(
  platform: PlatformName,
  body: unknown,
): IncomingPlatformMessage | null {
  switch (platform) {
    case "telegram":
      return parseTelegramMessage(body);
    case "discord":
      return parseDiscordMessage(body);
    case "slack":
      return parseSlackMessage(body);
    case "whatsapp":
      return parseWhatsAppMessage(body);
    case "signal":
      return parseSignalMessage(body);
    case "matrix":
      return parseMatrixMessage(body);
    case "email":
      return parseEmailMessage(body);
    case "sms":
      return parseSmsMessage(body);
    default:
      return null;
  }
}

function parseTelegramMessage(body: unknown): IncomingPlatformMessage | null {
  const payload = body as {
    message?: {
      message_id?: number;
      text?: string;
      chat?: { id?: number | string; type?: string; title?: string };
      from?: { id?: number | string; username?: string; first_name?: string; last_name?: string };
      reply_to_message?: { message_id?: number };
      date?: number;
    };
  };

  if (!payload.message?.text || payload.message.chat?.id === undefined || payload.message.from?.id === undefined) {
    return null;
  }

  return {
    platform: "telegram",
    userId: String(payload.message.from.id),
    roomId: String(payload.message.chat.id),
    text: payload.message.text,
    channelId: String(payload.message.chat.id),
    threadId: payload.message.reply_to_message?.message_id
      ? String(payload.message.reply_to_message.message_id)
      : undefined,
    messageId: payload.message.message_id ? String(payload.message.message_id) : undefined,
    replyToMessageId: payload.message.reply_to_message?.message_id
      ? String(payload.message.reply_to_message.message_id)
      : undefined,
    channelType: payload.message.chat.type,
    authorName:
      payload.message.from.username ??
      ([payload.message.from.first_name, payload.message.from.last_name].filter(Boolean).join(" ").trim() || undefined),
    timestamp: payload.message.date ? new Date(payload.message.date * 1000).toISOString() : undefined,
    metadata: normalizeMetadata([
      ["chatTitle", payload.message.chat.title],
      ["chatType", payload.message.chat.type],
      ["messageId", payload.message.message_id ? String(payload.message.message_id) : undefined],
      [
        "replyToMessageId",
        payload.message.reply_to_message?.message_id
          ? String(payload.message.reply_to_message.message_id)
          : undefined,
      ],
      [
        "authorName",
        payload.message.from.username ??
          ([payload.message.from.first_name, payload.message.from.last_name]
            .filter(Boolean)
            .join(" ")
            .trim() || undefined),
      ],
    ]),
  };
}

function parseDiscordMessage(body: unknown): IncomingPlatformMessage | null {
  const payload = body as {
    content?: string;
    channel_id?: string;
    id?: string;
    author?: { id?: string; username?: string; bot?: boolean };
    message_reference?: { message_id?: string };
    guild_id?: string;
    type?: number;
    thread_id?: string;
  };

  if (!payload.content || !payload.channel_id || !payload.author?.id || payload.author.bot) {
    return null;
  }

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
      ["messageType", typeof payload.type === "number" ? String(payload.type) : undefined],
      ["threadId", payload.thread_id ?? payload.message_reference?.message_id],
      ["replyToMessageId", payload.message_reference?.message_id],
    ]),
  };
}

function parseSlackMessage(body: unknown): IncomingPlatformMessage | null {
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
    ]),
  };
}

function parseWhatsAppMessage(body: unknown): IncomingPlatformMessage | null {
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
          }>;
        };
      }>;
    }>;
  };

  const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message?.from || !message.text?.body) {
    return null;
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
    ]),
  };
}

function parseSignalMessage(body: unknown): IncomingPlatformMessage | null {
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
  };

  const text = payload.text ?? payload.message ?? payload.body;
  const userId = payload.sender ?? payload.from;
  const roomId = payload.conversation_id ?? payload.sender ?? payload.from;
  if (!text || !userId || !roomId) {
    return null;
  }

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
    ]),
  };
}

function parseMatrixMessage(body: unknown): IncomingPlatformMessage | null {
  const payload = body as {
    sender?: string;
    room_id?: string;
    body?: string;
    content?: { body?: string };
    event_id?: string;
    relates_to?: { event_id?: string };
    timestamp?: string;
  };

  const text = payload.body ?? payload.content?.body;
  if (!text || !payload.sender || !payload.room_id) {
    return null;
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
    ]),
  };
}

function parseEmailMessage(body: unknown): IncomingPlatformMessage | null {
  const payload = body as {
    from?: string;
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
    message_id?: string;
    in_reply_to?: string;
    timestamp?: string;
    sender_name?: string;
  };

  const text = payload.text ?? payload.html ?? payload.subject;
  if (!text || !payload.from) {
    return null;
  }

  return {
    platform: "email",
    userId: payload.from,
    roomId: payload.to ?? payload.from,
    text,
    channelId: payload.to ?? payload.from,
    messageId: payload.message_id,
    replyToMessageId: payload.in_reply_to,
    timestamp: payload.timestamp,
    authorName: payload.sender_name,
    metadata: normalizeMetadata([
      ["subject", payload.subject],
      ["transport", "email"],
      ["messageId", payload.message_id],
      ["replyToMessageId", payload.in_reply_to],
    ]),
  };
}

function parseSmsMessage(body: unknown): IncomingPlatformMessage | null {
  const payload = body as {
    From?: string;
    To?: string;
    Body?: string;
    MessageSid?: string;
    SmsSid?: string;
    OriginalRepliedMessageSid?: string;
    ProfileName?: string;
    Timestamp?: string;
  };

  if (!payload.From || !payload.Body) {
    return null;
  }

  return {
    platform: "sms",
    userId: payload.From,
    roomId: payload.To ?? payload.From,
    text: payload.Body,
    channelId: payload.To ?? payload.From,
    messageId: payload.MessageSid ?? payload.SmsSid,
    replyToMessageId: payload.OriginalRepliedMessageSid,
    timestamp: payload.Timestamp,
    authorName: payload.ProfileName,
    metadata: normalizeMetadata([
      ["transport", "sms"],
      ["messageId", payload.MessageSid ?? payload.SmsSid],
      ["replyToMessageId", payload.OriginalRepliedMessageSid],
    ]),
  };
}
