import type { IncomingPlatformMessage } from "@/types/gateway";
import { attachmentMetadata, normalizeMetadata } from "../helpers";
import { buildAttachmentDescriptor } from "./shared";

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
          buildAttachmentDescriptor({
            name: attachment.filename,
            url: attachment.url,
            mimeType: attachment.content_type,
            size: attachment.size ? String(attachment.size) : undefined,
          }),
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
