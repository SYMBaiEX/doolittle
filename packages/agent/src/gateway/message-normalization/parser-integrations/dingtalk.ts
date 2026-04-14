import type { IncomingPlatformMessage } from "@/types/gateway";
import { normalizeMetadata } from "../helpers";

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
