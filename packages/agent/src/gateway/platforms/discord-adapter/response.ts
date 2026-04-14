import { parseMessagingResponse } from "../messaging-utils";

interface DiscordApiResponse {
  id?: string;
  channel_id?: string;
}

export function parseDiscordResponse(bodyText: string): {
  messageId?: string;
  roomId?: string;
} {
  return parseMessagingResponse<DiscordApiResponse>(bodyText, (parsed) => ({
    messageId: parsed.id,
    roomId: parsed.channel_id,
  }));
}
