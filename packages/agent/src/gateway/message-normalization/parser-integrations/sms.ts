import type { IncomingPlatformMessage } from "@/types/gateway";
import type { AttachmentDescriptor } from "../helpers";
import { attachmentMetadata, normalizeMetadata } from "../helpers";
import { buildAttachmentDescriptor } from "./shared";

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
    attachments.push(
      buildAttachmentDescriptor({
        name: `sms-media-${payload.MessageSid ?? payload.SmsSid ?? "unknown"}`,
        url: payload.MediaUrl0,
        mimeType: payload.MediaContentType0,
      }),
    );
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
