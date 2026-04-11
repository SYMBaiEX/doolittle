import type { IncomingPlatformMessage, PlatformName } from "@/types/gateway";
import {
  parseDingtalkMessage,
  parseDiscordMessage,
  parseEmailMessage,
  parseHomeAssistantMessage,
  parseMatrixMessage,
  parseMattermostMessage,
  parseSignalMessage,
  parseSlackMessage,
  parseSmsMessage,
  parseTelegramMessage,
  parseWhatsAppMessage,
} from "./parsers";

export {
  parseDingtalkMessage,
  parseDiscordMessage,
  parseEmailMessage,
  parseHomeAssistantMessage,
  parseMatrixMessage,
  parseMattermostMessage,
  parseSignalMessage,
  parseSlackMessage,
  parseSmsMessage,
  parseTelegramMessage,
  parseWhatsAppMessage,
} from "./parsers";

export function normalizeInboundMessage(
  platform: PlatformName,
  body: unknown,
): IncomingPlatformMessage | null {
  switch (platform) {
    case "telegram":
      return parseTelegramMessage(body);
    case "discord":
      return parseDiscordMessage(body);
    case "slack":
      return parseSlackMessage(body);
    case "whatsapp":
      return parseWhatsAppMessage(body);
    case "signal":
      return parseSignalMessage(body);
    case "matrix":
      return parseMatrixMessage(body);
    case "email":
      return parseEmailMessage(body);
    case "sms":
      return parseSmsMessage(body);
    case "mattermost":
      return parseMattermostMessage(body);
    case "homeassistant":
      return parseHomeAssistantMessage(body);
    case "dingtalk":
      return parseDingtalkMessage(body);
    default:
      return null;
  }
}
