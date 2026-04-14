import type { OutboundPlatformMessage } from "@/types/gateway";
import { resolveVoiceAttachment } from "../messaging-utils";

interface TelegramRequestResult {
  response: Response;
  bodyText: string;
}

export async function sendTelegramMessage(
  apiRoot: string,
  botToken: string,
  message: OutboundPlatformMessage,
): Promise<TelegramRequestResult> {
  const voicePath = resolveVoiceAttachment(message.metadata);
  const response = voicePath
    ? await sendTelegramVoiceMessage(apiRoot, botToken, message, voicePath)
    : await fetch(`${apiRoot}/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          chat_id: message.roomId,
          text: message.text,
          ...(message.replyToId
            ? {
                reply_to_message_id:
                  Number(message.replyToId) || message.replyToId,
              }
            : {}),
        }),
      });

  return {
    response,
    bodyText: await response.text(),
  };
}

export async function editTelegramMessage(
  apiRoot: string,
  botToken: string,
  chatId: string,
  messageId: string,
  text: string,
): Promise<TelegramRequestResult> {
  const response = await fetch(`${apiRoot}/bot${botToken}/editMessageText`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: Number(messageId) || messageId,
      text,
    }),
  });

  return {
    response,
    bodyText: await response.text(),
  };
}

async function sendTelegramVoiceMessage(
  apiRoot: string,
  botToken: string,
  message: OutboundPlatformMessage,
  voicePath: string,
): Promise<Response> {
  const form = new FormData();
  form.set("chat_id", message.roomId);
  form.set("caption", message.text);
  form.set("voice", Bun.file(voicePath));

  if (message.replyToId) {
    form.set(
      "reply_to_message_id",
      String(Number(message.replyToId) || message.replyToId),
    );
  }

  return fetch(`${apiRoot}/bot${botToken}/sendVoice`, {
    method: "POST",
    body: form,
  });
}
