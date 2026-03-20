import type { IncomingPlatformMessage, PlatformName } from "@/types";

function normalizeMetadata(
  entries: Array<[string, string | undefined | null]>,
): Record<string, string> {
  return Object.fromEntries(
    entries.filter(([, value]) => Boolean(value)),
  ) as Record<string, string>;
}

interface AttachmentDescriptor {
  kind?: string;
  name?: string;
  url?: string;
  mimeType?: string;
  size?: string;
  caption?: string;
  durationMs?: string;
  width?: string;
  height?: string;
}

function joinAttachmentValues(
  values: Array<string | undefined | null>,
): string | undefined {
  const filtered = values.filter((value): value is string => Boolean(value));
  return filtered.length > 0 ? filtered.join("|") : undefined;
}

function attachmentMetadata(
  descriptors: AttachmentDescriptor[],
): Record<string, string> {
  if (descriptors.length === 0) {
    return {};
  }

  return normalizeMetadata([
    ["attachmentCount", String(descriptors.length)],
    [
      "attachmentKinds",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.kind)),
    ],
    [
      "attachmentNames",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.name)),
    ],
    [
      "attachmentUrls",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.url)),
    ],
    [
      "attachmentMimeTypes",
      joinAttachmentValues(
        descriptors.map((descriptor) => descriptor.mimeType),
      ),
    ],
    [
      "attachmentSizes",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.size)),
    ],
    [
      "attachmentCaptions",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.caption)),
    ],
    [
      "attachmentDurationsMs",
      joinAttachmentValues(
        descriptors.map((descriptor) => descriptor.durationMs),
      ),
    ],
    [
      "attachmentWidths",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.width)),
    ],
    [
      "attachmentHeights",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.height)),
    ],
  ]);
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
    case "mattermost":
      return parseMattermostMessage(body);
    case "homeassistant":
      return parseHomeAssistantMessage(body);
    case "dingtalk":
      return parseDingtalkMessage(body);
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
      from?: {
        id?: number | string;
        username?: string;
        first_name?: string;
        last_name?: string;
      };
      reply_to_message?: { message_id?: number };
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
    !payload.message?.text ||
    payload.message.chat?.id === undefined ||
    payload.message.from?.id === undefined
  ) {
    return null;
  }

  const attachments: AttachmentDescriptor[] = [];
  const photo = payload.message.photo?.at(-1);
  if (photo?.file_id) {
    attachments.push({
      kind: "photo",
      name: `telegram-photo-${payload.message.message_id ?? "unknown"}`,
      url: photo.file_id,
      mimeType: "image/jpeg",
    });
  }
  if (payload.message.document?.file_id) {
    attachments.push({
      kind: "document",
      name:
        payload.message.document.file_name ??
        `telegram-document-${payload.message.message_id ?? "unknown"}`,
      url: payload.message.document.file_id,
      mimeType: payload.message.document.mime_type,
      size: payload.message.document.file_size
        ? String(payload.message.document.file_size)
        : undefined,
    });
  }
  if (payload.message.video?.file_id) {
    attachments.push({
      kind: "video",
      name:
        payload.message.video.file_name ??
        `telegram-video-${payload.message.message_id ?? "unknown"}`,
      url: payload.message.video.file_id,
      mimeType: payload.message.video.mime_type,
      size: payload.message.video.file_size
        ? String(payload.message.video.file_size)
        : undefined,
    });
  }
  if (payload.message.voice?.file_id) {
    attachments.push({
      kind: "voice",
      name: `telegram-voice-${payload.message.message_id ?? "unknown"}`,
      url: payload.message.voice.file_id,
      mimeType: payload.message.voice.mime_type,
      durationMs: payload.message.voice.duration
        ? String(payload.message.voice.duration * 1000)
        : undefined,
      size: payload.message.voice.file_size
        ? String(payload.message.voice.file_size)
        : undefined,
    });
  }
  if (payload.message.audio?.file_id) {
    attachments.push({
      kind: "audio",
      name:
        payload.message.audio.file_name ??
        `telegram-audio-${payload.message.message_id ?? "unknown"}`,
      url: payload.message.audio.file_id,
      mimeType: payload.message.audio.mime_type,
      durationMs: payload.message.audio.duration
        ? String(payload.message.audio.duration * 1000)
        : undefined,
      size: payload.message.audio.file_size
        ? String(payload.message.audio.file_size)
        : undefined,
    });
  }
  if (payload.message.animation?.file_id) {
    attachments.push({
      kind: "animation",
      name:
        payload.message.animation.file_name ??
        `telegram-animation-${payload.message.message_id ?? "unknown"}`,
      url: payload.message.animation.file_id,
      mimeType: payload.message.animation.mime_type,
      size: payload.message.animation.file_size
        ? String(payload.message.animation.file_size)
        : undefined,
    });
  }
  if (payload.message.sticker?.file_id) {
    attachments.push({
      kind: "sticker",
      name:
        payload.message.sticker.emoji ??
        `telegram-sticker-${payload.message.message_id ?? "unknown"}`,
      url: payload.message.sticker.file_id,
      mimeType: payload.message.sticker.is_animated
        ? "image/webp+animated"
        : "image/webp",
    });
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
    messageId: payload.message.message_id
      ? String(payload.message.message_id)
      : undefined,
    replyToMessageId: payload.message.reply_to_message?.message_id
      ? String(payload.message.reply_to_message.message_id)
      : undefined,
    channelType: payload.message.chat.type,
    authorName:
      payload.message.from.username ??
      ([payload.message.from.first_name, payload.message.from.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
        undefined),
    timestamp: payload.message.date
      ? new Date(payload.message.date * 1000).toISOString()
      : undefined,
    metadata: normalizeMetadata([
      ["chatTitle", payload.message.chat.title],
      ["chatType", payload.message.chat.type],
      [
        "messageId",
        payload.message.message_id
          ? String(payload.message.message_id)
          : undefined,
      ],
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
            .trim() ||
            undefined),
      ],
      ...Object.entries(attachmentMetadata(attachments)),
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

  const attachments = (payload.attachments ?? []).flatMap((attachment) =>
    attachment.url || attachment.proxy_url
      ? [
          {
            kind: attachment.content_type?.startsWith("image/")
              ? "image"
              : attachment.content_type?.startsWith("video/")
                ? "video"
                : attachment.content_type?.startsWith("audio/")
                  ? "audio"
                  : "file",
            name: attachment.filename ?? attachment.id,
            url: attachment.url ?? attachment.proxy_url,
            mimeType: attachment.content_type,
            size: attachment.size ? String(attachment.size) : undefined,
            width: attachment.width ? String(attachment.width) : undefined,
            height: attachment.height ? String(attachment.height) : undefined,
          } satisfies AttachmentDescriptor,
        ]
      : [],
  );

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

  const attachments = (payload.event.files ?? []).flatMap((file) =>
    file.url_private
      ? [
          {
            kind: file.mimetype?.startsWith("image/")
              ? "image"
              : file.mimetype?.startsWith("video/")
                ? "video"
                : file.mimetype?.startsWith("audio/")
                  ? "audio"
                  : "file",
            name: file.name ?? file.id,
            url: file.url_private,
            mimeType: file.mimetype,
            size: file.size ? String(file.size) : undefined,
          } satisfies AttachmentDescriptor,
        ]
      : [],
  );

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

  const attachments = (payload.attachments ?? []).flatMap((attachment) =>
    attachment.url || attachment.data
      ? [
          {
            kind: attachment.content_type?.startsWith("image/")
              ? "image"
              : attachment.content_type?.startsWith("video/")
                ? "video"
                : attachment.content_type?.startsWith("audio/")
                  ? "audio"
                  : "file",
            name: attachment.filename ?? attachment.id,
            url: attachment.url ?? attachment.data,
            mimeType: attachment.content_type,
            size: attachment.size ? String(attachment.size) : undefined,
          } satisfies AttachmentDescriptor,
        ]
      : [],
  );

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

function parseMatrixMessage(body: unknown): IncomingPlatformMessage | null {
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
  if (payload.url) {
    attachments.push({
      kind:
        payload.msgtype === "m.image"
          ? "image"
          : payload.msgtype === "m.video"
            ? "video"
            : payload.msgtype === "m.audio"
              ? "audio"
              : "file",
      name: payload.filename ?? payload.event_id ?? "matrix-attachment",
      url: payload.url,
      mimeType: payload.info?.mimetype,
      size: payload.info?.size ? String(payload.info.size) : undefined,
      width: payload.info?.w ? String(payload.info.w) : undefined,
      height: payload.info?.h ? String(payload.info.h) : undefined,
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
    attachments?: Array<{
      filename?: string;
      url?: string;
      content_type?: string;
      size?: number;
    }>;
  };

  const text = payload.text ?? payload.html ?? payload.subject;
  if (!text || !payload.from) {
    return null;
  }

  const attachments = (payload.attachments ?? []).flatMap((attachment) =>
    attachment.url
      ? [
          {
            kind: attachment.content_type?.startsWith("image/")
              ? "image"
              : attachment.content_type?.startsWith("video/")
                ? "video"
                : attachment.content_type?.startsWith("audio/")
                  ? "audio"
                  : "file",
            name: attachment.filename,
            url: attachment.url,
            mimeType: attachment.content_type,
            size: attachment.size ? String(attachment.size) : undefined,
          } satisfies AttachmentDescriptor,
        ]
      : [],
  );

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
      ...Object.entries(attachmentMetadata(attachments)),
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
    NumMedia?: string;
    MediaUrl0?: string;
    MediaContentType0?: string;
  };

  if (!payload.From || !payload.Body) {
    return null;
  }

  const attachments: AttachmentDescriptor[] = [];
  if (payload.MediaUrl0) {
    attachments.push({
      kind: payload.MediaContentType0?.startsWith("image/")
        ? "image"
        : payload.MediaContentType0?.startsWith("video/")
          ? "video"
          : payload.MediaContentType0?.startsWith("audio/")
            ? "audio"
            : "file",
      name: `sms-media-${payload.MessageSid ?? payload.SmsSid ?? "unknown"}`,
      url: payload.MediaUrl0,
      mimeType: payload.MediaContentType0,
    });
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
      ...Object.entries(attachmentMetadata(attachments)),
    ]),
  };
}

function parseMattermostMessage(body: unknown): IncomingPlatformMessage | null {
  const payload = body as {
    post?: {
      id?: string;
      message?: string;
      channel_id?: string;
      root_id?: string;
      user_id?: string;
      props?: Record<string, unknown>;
      file_ids?: string[];
    };
    sender_name?: string;
    channel_name?: string;
    team_domain?: string;
  };

  if (
    !payload.post?.message ||
    !payload.post.channel_id ||
    !payload.post.user_id
  ) {
    return null;
  }

  return {
    platform: "mattermost",
    userId: payload.post.user_id,
    roomId: payload.post.channel_id,
    text: payload.post.message,
    threadId: payload.post.root_id,
    replyToMessageId: payload.post.root_id,
    messageId: payload.post.id,
    metadata: normalizeMetadata([
      ["authorName", payload.sender_name],
      ["channelName", payload.channel_name],
      ["teamDomain", payload.team_domain],
      ["fileIds", payload.post.file_ids?.join("|")],
      ["propKeys", Object.keys(payload.post.props ?? {}).join("|")],
    ]),
  };
}

function parseHomeAssistantMessage(
  body: unknown,
): IncomingPlatformMessage | null {
  const payload = body as {
    event?: {
      event_type?: string;
      data?: {
        message?: string;
        channel?: string;
        user_id?: string;
        thread_id?: string;
        reply_to_id?: string;
      };
      context?: {
        id?: string;
        user_id?: string;
      };
    };
  };

  const data = payload.event?.data;
  if (!data?.message || !data.channel) {
    return null;
  }

  return {
    platform: "homeassistant",
    userId: data.user_id ?? payload.event?.context?.user_id ?? "homeassistant",
    roomId: data.channel,
    text: data.message,
    threadId: data.thread_id,
    replyToMessageId: data.reply_to_id,
    messageId: payload.event?.context?.id,
    metadata: normalizeMetadata([
      ["eventType", payload.event?.event_type],
      ["contextId", payload.event?.context?.id],
    ]),
  };
}

function parseDingtalkMessage(body: unknown): IncomingPlatformMessage | null {
  const payload = body as {
    text?: { content?: string };
    senderId?: string;
    senderNick?: string;
    conversationId?: string;
    msgId?: string;
    sessionWebhookExpiredTime?: number | string;
  };

  if (!payload.text?.content || !payload.senderId || !payload.conversationId) {
    return null;
  }

  return {
    platform: "dingtalk",
    userId: payload.senderId,
    roomId: payload.conversationId,
    text: payload.text.content,
    messageId: payload.msgId,
    metadata: normalizeMetadata([
      ["authorName", payload.senderNick],
      [
        "sessionWebhookExpiredTime",
        payload.sessionWebhookExpiredTime
          ? String(payload.sessionWebhookExpiredTime)
          : undefined,
      ],
    ]),
  };
}
