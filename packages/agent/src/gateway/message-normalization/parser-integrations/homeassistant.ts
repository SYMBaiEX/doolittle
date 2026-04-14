import type { IncomingPlatformMessage } from "@/types/gateway";
import { normalizeMetadata } from "../helpers";

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
