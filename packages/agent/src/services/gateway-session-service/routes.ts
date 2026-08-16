import { createHash } from "node:crypto";
import type { IncomingPlatformMessage, SessionRoute } from "@/types";

export interface SessionRouteStore {
  sessions: SessionRoute[];
}

export function nowIso(): string {
  return new Date().toISOString();
}

const MAX_ACCOUNT_ID_LENGTH = 120;

export function normalizeAccountId(accountId?: string): string | undefined {
  const normalized = accountId?.trim();
  return normalized || undefined;
}

// Shared by route and pairing identities. It keeps untrusted connector account
// IDs delimiter-safe and bounded without conflating malformed Unicode.
export function createAccountIdentity(accountId?: string): string | undefined {
  const normalized = normalizeAccountId(accountId);
  if (!normalized) return undefined;

  let encoded: string;
  try {
    encoded = encodeURIComponent(normalized);
  } catch {
    // encodeURIComponent rejects lone UTF-16 surrogates. Hash their code units
    // directly so malformed account IDs remain distinct and never reject ingress.
    return `$sha256-utf16le-${createHash("sha256").update(normalized, "utf16le").digest("hex")}`;
  }

  if (encoded.length <= MAX_ACCOUNT_ID_LENGTH) {
    return encoded;
  }

  return `$sha256-${createHash("sha256").update(normalized).digest("hex")}`;
}

export function createUnscopedSessionKey(
  message: IncomingPlatformMessage,
): string {
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
  return parts.join(":");
}

export function createUnattributedSessionKey(
  message: IncomingPlatformMessage,
): string {
  return `${createUnscopedSessionKey(message)}:scope=unattributed`;
}

export function createSessionKey(message: IncomingPlatformMessage): string {
  const parts = [createUnscopedSessionKey(message)];
  const accountIdentity = createAccountIdentity(message.metadata?.accountId);
  // Legacy/no-account keys remain byte-for-byte stable. Account identities are
  // encoded so delimiters cannot make session keys ambiguous, and are bounded
  // before they are persisted in the route store.
  if (accountIdentity) parts.push(`account=${accountIdentity}`);
  return parts.join(":");
}

export function createLegacyTelegramAccountSessionKey(
  message: IncomingPlatformMessage,
): string | undefined {
  if (message.platform !== "telegram") return undefined;

  const accountId = normalizeAccountId(message.metadata?.accountId);
  if (!accountId) return undefined;

  // This reproduces a pre-upgrade key strictly for in-memory route lookup. It
  // is never persisted: new keys always use createSessionKey's bounded identity.
  return `${createUnscopedSessionKey(message)}:account=${accountId}`;
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
