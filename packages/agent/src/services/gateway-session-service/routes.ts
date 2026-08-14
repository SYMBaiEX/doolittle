import type { IncomingPlatformMessage, SessionRoute } from "@/types";

export interface SessionRouteStore {
  sessions: SessionRoute[];
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createSessionKey(message: IncomingPlatformMessage): string {
  const threadIdentity =
    message.platform === "telegram"
      ? // Telegram reply IDs identify messages, not forum topics. Native inbound
        // uses threadId only for message_thread_id topic sessions.
        (message.threadId ?? "root")
      : (message.threadId ?? message.replyToMessageId ?? "root");
  const parts = [
    message.platform,
    message.roomId,
    message.userId,
    threadIdentity,
  ];
  const accountId =
    message.platform === "telegram" ? message.metadata?.accountId?.trim() : "";
  // Legacy/no-account keys remain byte-for-byte stable; only live native
  // multi-account Telegram contexts receive an additional identity segment.
  if (accountId) parts.push(`account=${accountId}`);
  return parts.join(":");
}

export function createSessionRoute(
  message: IncomingPlatformMessage,
): SessionRoute {
  return {
    sessionKey: createSessionKey(message),
    roomId: message.roomId,
    userId: message.userId,
    platform: message.platform,
    channelId: message.channelId,
    threadId: message.threadId,
    messageId: message.messageId,
    replyToMessageId: message.replyToMessageId,
    channelType: message.channelType,
    authorName: message.authorName,
    metadata: message.metadata,
    voiceMode: "off",
    voiceChannelState: "disconnected",
    voiceUpdatedAt: nowIso(),
    voiceUpdatedReason: "session-created",
    isHome: false,
    homeUpdatedAt: nowIso(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function normalizeSessionRoute(route: SessionRoute): SessionRoute {
  return {
    ...route,
    activeAgentSessionId: route.activeAgentSessionId ?? route.sessionKey,
    voiceMode: route.voiceMode ?? "off",
    voiceChannelState: route.voiceChannelState ?? "disconnected",
    voiceUpdatedAt: route.voiceUpdatedAt ?? route.updatedAt,
    voiceUpdatedReason: route.voiceUpdatedReason ?? "session-updated",
    isHome: route.isHome ?? false,
    homeUpdatedAt: route.homeUpdatedAt ?? route.updatedAt,
  };
}
