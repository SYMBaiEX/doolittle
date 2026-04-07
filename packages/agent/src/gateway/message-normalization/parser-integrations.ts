import type { IncomingPlatformMessage } from "@/types/gateway";
import {
  type AttachmentDescriptor,
  attachmentMetadata,
  normalizeMetadata,
} from "./helpers";

export function parseEmailMessage(
  body: unknown,
): IncomingPlatformMessage | null {
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

export function parseSmsMessage(body: unknown): IncomingPlatformMessage | null {
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

export function parseMattermostMessage(
  body: unknown,
): IncomingPlatformMessage | null {
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

export function parseHomeAssistantMessage(
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

export function parseDingtalkMessage(
  body: unknown,
): IncomingPlatformMessage | null {
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
