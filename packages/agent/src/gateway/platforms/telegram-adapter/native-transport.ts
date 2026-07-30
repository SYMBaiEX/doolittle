import type {
  NativeTelegramSentMessage,
  NativeTelegramTransportService,
} from "@/runtime/native/service-bridge/runtime-contracts";
import type { OutboundPlatformMessage } from "@/types/gateway";
import { resolveVoiceAttachment } from "../messaging-utils";

export interface TelegramDeliveryMetadata {
  messageId?: string;
  roomId?: string;
}

function numericId(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function deliveryMetadata(
  message: NativeTelegramSentMessage | undefined,
): TelegramDeliveryMetadata {
  if (!message) {
    return {};
  }
  return {
    messageId: String(message.message_id),
    roomId: String(message.chat.id),
  };
}

export function requireNativeTelegramService(
  resolve: () => NativeTelegramTransportService | undefined,
): NativeTelegramTransportService {
  const service = resolve();
  if (!service?.getBot?.() || !service.messageManager) {
    throw new Error(
      "The native Eliza Telegram service is not ready. Check the Telegram plugin and bot token.",
    );
  }
  return service;
}

async function sendNativeTelegramVoice(
  service: NativeTelegramTransportService,
  message: OutboundPlatformMessage,
  voicePath: string,
): Promise<TelegramDeliveryMetadata> {
  const bot = service.getBot?.();
  if (!bot) {
    throw new Error("The native Eliza Telegram bot is not ready.");
  }

  const messageThreadId = numericId(message.threadId);
  const replyToMessageId = numericId(message.replyToId);
  const sent = await bot.telegram.sendVoice(
    message.roomId,
    { source: voicePath },
    {
      ...(message.text ? { caption: message.text } : {}),
      ...(messageThreadId !== undefined
        ? { message_thread_id: messageThreadId }
        : {}),
      ...(replyToMessageId !== undefined
        ? { reply_parameters: { message_id: replyToMessageId } }
        : {}),
    },
  );
  return deliveryMetadata(sent);
}

export async function sendNativeTelegramMessage(
  service: NativeTelegramTransportService,
  message: OutboundPlatformMessage,
): Promise<TelegramDeliveryMetadata> {
  const voicePath = resolveVoiceAttachment(message.metadata);
  if (voicePath) {
    return sendNativeTelegramVoice(service, message, voicePath);
  }

  const manager = service.messageManager;
  if (!manager) {
    throw new Error("The native Eliza Telegram message manager is not ready.");
  }
  const sent = await manager.sendMessage(
    message.roomId,
    {
      text: message.text,
      source: "telegram",
      metadata: message.metadata,
    },
    numericId(message.replyToId),
    numericId(message.threadId),
  );
  const lastMessage = sent.at(-1);
  if (!lastMessage) {
    throw new Error("The native Eliza Telegram service returned no delivery.");
  }
  return deliveryMetadata(lastMessage);
}

export async function editNativeTelegramMessage(
  service: NativeTelegramTransportService,
  input: {
    roomId: string;
    messageId: string;
    text: string;
    threadId?: string;
  },
): Promise<TelegramDeliveryMetadata> {
  const manager = service.messageManager;
  if (!manager) {
    throw new Error("The native Eliza Telegram message manager is not ready.");
  }
  const messageId = numericId(input.messageId);
  if (messageId === undefined) {
    throw new Error("Telegram edit requires a numeric platform message id.");
  }
  await manager.editMessage(
    input.roomId,
    messageId,
    input.text,
    numericId(input.threadId),
  );
  return {
    messageId: input.messageId,
    roomId: input.roomId,
  };
}
