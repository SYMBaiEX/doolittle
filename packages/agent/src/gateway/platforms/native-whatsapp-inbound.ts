import type { GatewayRunner } from "@/gateway/runner";
import type { IncomingPlatformMessage } from "@/types/gateway";

const WHATSAPP_SERVICE = "whatsapp";
const HANDOFF_INSTALLED = Symbol.for(
  "doolittle.gateway.native-whatsapp-inbound-handoff",
);

/**
 * The pinned WhatsApp connector emits this normalized shape from both its
 * Cloud API and Baileys clients. It is structural because beta.7 keeps the
 * callback private on WhatsAppConnectorService.
 */
export type NativeWhatsAppMessage = {
  id?: string;
  from?: string;
  timestamp?: number;
  type?: string;
  content?: string;
  chatId?: string;
  senderId?: string;
  replyToId?: string;
};

type WhatsAppServiceLike = {
  handleNormalizedMessage?: (
    message: NativeWhatsAppMessage,
    accountId?: string,
  ) => Promise<void>;
  sendMessage?: (message: {
    accountId?: string;
    type: "text";
    to: string;
    content: string;
    replyToMessageId?: string;
  }) => Promise<unknown>;
  [HANDOFF_INSTALLED]?: boolean;
};

export interface NativeWhatsAppInboundGateway {
  receive(message: IncomingPlatformMessage): Promise<{
    ok: boolean;
    response?: string;
    pairingCode?: string;
    agentCompleted?: boolean;
    deliveryStatus?: "sent" | "fallback" | "rejected";
  }>;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Normalize the concrete beta.7 WhatsApp client callback payload. */
export function normalizeNativeWhatsAppMessage(
  message: NativeWhatsAppMessage,
  accountId?: string,
): IncomingPlatformMessage | null {
  if (
    !message ||
    !isNonEmpty(message.id) ||
    !isNonEmpty(message.from) ||
    typeof message.timestamp !== "number" ||
    !Number.isFinite(message.timestamp)
  ) {
    return null;
  }

  const roomId = isNonEmpty(message.chatId)
    ? message.chatId.trim()
    : message.from.trim();
  const userId = isNonEmpty(message.senderId)
    ? message.senderId.trim()
    : message.from.trim();
  const text = isNonEmpty(message.content)
    ? message.content.trim()
    : message.type && message.type !== "text"
      ? `[WhatsApp ${message.type} attachment]`
      : "";
  if (!text) return null;

  const isGroup = roomId.endsWith("@g.us");
  const timestamp = String(message.timestamp);
  const messageId = message.id.trim();
  return {
    platform: "whatsapp",
    userId,
    roomId,
    text,
    channelId: roomId,
    messageId,
    ...(isNonEmpty(message.replyToId)
      ? { replyToMessageId: message.replyToId.trim() }
      : {}),
    channelType: isGroup ? "group" : "dm",
    timestamp,
    metadata: {
      nativeConnector: "whatsapp",
      messageId,
      timestamp,
      messageType: message.type ?? "text",
      ...(accountId ? { accountId } : {}),
      ...(isNonEmpty(message.chatId) ? { chatId: roomId } : {}),
      ...(isGroup ? { groupId: roomId } : {}),
    },
  };
}

/**
 * Routes native WhatsApp client callbacks through Doolittle's gateway policy.
 * The connector still owns transport and outbound replies; the gateway owns
 * pairing, sessions, traces, inbox records, and journaled delivery.
 */
export function installNativeWhatsAppInboundHandoff(
  runtime: { getService: (serviceType: string) => unknown },
  gateway: NativeWhatsAppInboundGateway | GatewayRunner,
): boolean {
  const service = runtime.getService(
    WHATSAPP_SERVICE,
  ) as WhatsAppServiceLike | null;
  if (!service?.handleNormalizedMessage || service[HANDOFF_INSTALLED]) {
    return false;
  }

  service.handleNormalizedMessage = async function (message, accountId) {
    const inbound = normalizeNativeWhatsAppMessage(message, accountId);
    if (!inbound) return;
    const result = await gateway.receive(inbound);
    if (result.ok || result.agentCompleted || !result.response?.trim()) return;
    await this.sendMessage?.({
      ...(accountId ? { accountId } : {}),
      type: "text",
      to: inbound.roomId,
      content: result.response,
      replyToMessageId: inbound.messageId,
    });
  };
  Object.defineProperty(service, HANDOFF_INSTALLED, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  return true;
}
