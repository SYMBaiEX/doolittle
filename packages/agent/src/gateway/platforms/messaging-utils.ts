import { existsSync } from "node:fs";

export interface ParsedMessagingResponse {
  messageId?: string;
  roomId?: string;
}

export function resolveVoiceAttachment(
  metadata?: Record<string, string>,
): string | undefined {
  if (metadata?.audioAsVoice !== "true") {
    return undefined;
  }
  const firstPath = metadata.attachmentUrls?.split("|").find(Boolean)?.trim();
  if (!firstPath || !existsSync(firstPath)) {
    return undefined;
  }
  return firstPath;
}

export function parseMessagingResponse<T>(
  bodyText: string,
  select: (payload: T) => ParsedMessagingResponse,
): ParsedMessagingResponse {
  try {
    return select(JSON.parse(bodyText) as T);
  } catch {
    return {};
  }
}

export function mergeMessagingMetadata(
  metadata: Record<string, string> | undefined,
  parsed: ParsedMessagingResponse,
): Record<string, string> {
  return {
    ...(metadata ?? {}),
    ...(parsed.messageId ? { platformMessageId: parsed.messageId } : {}),
    ...(parsed.roomId ? { platformRoomId: parsed.roomId } : {}),
  };
}
