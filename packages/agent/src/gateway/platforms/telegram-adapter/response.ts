import { parseMessagingResponse } from "../messaging-utils";

interface TelegramApiResponse {
  result?: {
    message_id?: number | string;
    chat?: { id?: number | string };
  };
}

export function parseTelegramResponse(bodyText: string): {
  messageId?: string;
  roomId?: string;
} {
  return parseMessagingResponse<TelegramApiResponse>(bodyText, (parsed) => ({
    messageId: parsed.result?.message_id
      ? String(parsed.result.message_id)
      : undefined,
    roomId: parsed.result?.chat?.id ? String(parsed.result.chat.id) : undefined,
  }));
}
