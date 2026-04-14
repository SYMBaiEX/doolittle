import type { OutboundPlatformMessage } from "@/types/gateway";

export function buildDiscordPayload(
  message: OutboundPlatformMessage,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    content: message.text,
  };

  if (message.replyToId) {
    payload.message_reference = {
      message_id: message.replyToId,
      channel_id: message.roomId,
    };
  }

  if (message.threadId) {
    payload.message_reference = {
      ...(payload.message_reference as Record<string, unknown>),
      message_id: message.threadId,
      channel_id: message.roomId,
    };
  }

  return payload;
}

export function buildDiscordEditPayload(
  message: OutboundPlatformMessage,
): Record<string, string> {
  return {
    content: message.text,
  };
}
