import { normalizeInboundMessage } from "@/gateway/message-normalization";
import type { GatewayRunner } from "@/gateway/runner";
import type { IncomingPlatformMessage } from "@/types/gateway";

const TELEGRAM_SERVICE = "telegram";
const HANDOFF_INSTALLED = Symbol.for(
  "doolittle.gateway.native-telegram-inbound-handoff",
);

type TelegramMedia = {
  file_id?: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  duration?: number;
  emoji?: string;
  is_animated?: boolean;
};

export type NativeTelegramMessage = {
  message_id?: number;
  text?: string;
  caption?: string;
  date?: number;
  chat?: { id?: string | number; type?: string; title?: string };
  from?: {
    id?: string | number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  reply_to_message?: { message_id?: number };
  message_thread_id?: number;
  is_topic_message?: boolean;
  photo?: TelegramMedia[];
  document?: TelegramMedia;
  video?: TelegramMedia;
  voice?: TelegramMedia;
  audio?: TelegramMedia;
  animation?: TelegramMedia;
  sticker?: TelegramMedia;
};

export type NativeTelegramContext = { message?: NativeTelegramMessage };

type TelegramMessageManager = {
  handleMessage?: (context: NativeTelegramContext) => Promise<void>;
  sendMessage?: (
    chatId: string | number,
    content: {
      text?: string;
      source?: string;
      metadata?: Record<string, string>;
    },
    replyToMessageId?: number,
    messageThreadId?: number,
  ) => Promise<unknown>;
  [HANDOFF_INSTALLED]?: boolean;
};

type TelegramAccountState = {
  accountId?: string;
  messageManager?: TelegramMessageManager | null;
};

type TelegramServiceLike = {
  accountId?: string;
  messageManager?: TelegramMessageManager | null;
  getAccountIds?: () => string[];
  getAccountState?: (accountId?: string) => TelegramAccountState | null;
  [HANDOFF_INSTALLED]?: boolean;
};

export interface NativeTelegramInboundGateway {
  receive(message: IncomingPlatformMessage): Promise<{
    ok: boolean;
    response?: string;
    pairingCode?: string;
  }>;
}

function hasMedia(message: NativeTelegramMessage): boolean {
  return Boolean(
    message.photo?.some((photo) => photo?.file_id) ||
      message.document?.file_id ||
      message.video?.file_id ||
      message.voice?.file_id ||
      message.audio?.file_id ||
      message.animation?.file_id ||
      message.sticker?.file_id,
  );
}

function numericId(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Converts Telegraf's live message payload into the shared webhook parser
 * shape. Captions and media-only updates are adapted locally because beta.7's
 * parser intentionally expects text, while the native manager accepts both.
 */
function toParserPayload(context: NativeTelegramContext): {
  message: NativeTelegramMessage;
} | null {
  const message = context?.message;
  if (!message?.chat || !message.from) return null;

  const text = message.text ?? message.caption;
  if (!text && !hasMedia(message)) return null;
  return {
    message: {
      ...message,
      text: text || "[Telegram attachment]",
    },
  };
}

/** Normalize beta.7 Telegram MessageManager contexts for gateway receipt. */
export function normalizeNativeTelegramMessage(
  context: NativeTelegramContext,
  accountId?: string,
): IncomingPlatformMessage | null {
  const payload = toParserPayload(context);
  if (!payload) return null;

  const normalized = normalizeInboundMessage("telegram", payload);
  if (!normalized) return null;
  const message = payload.message;
  const topicThreadId =
    message.is_topic_message && Number.isFinite(message.message_thread_id)
      ? String(message.message_thread_id)
      : undefined;
  return {
    ...normalized,
    // Telegram replies are not forum threads. The shared parser is used for
    // webhook compatibility, then this live-context-only topic identity wins.
    threadId: topicThreadId,
    metadata: {
      ...(normalized.metadata ?? {}),
      nativeConnector: "telegram",
      ...(accountId ? { accountId } : {}),
      ...(topicThreadId
        ? { isTopicMessage: "true", messageThreadId: topicThreadId }
        : {}),
    },
  };
}

async function deliverGatewayRejection(
  manager: TelegramMessageManager,
  inbound: IncomingPlatformMessage,
  result: { ok: boolean; response?: string; pairingCode?: string },
  accountId?: string,
): Promise<void> {
  if (result.ok || !result.response?.trim() || !manager.sendMessage) return;
  await manager.sendMessage(
    inbound.roomId,
    {
      text: result.response,
      source: "telegram",
      metadata: {
        nativeConnector: "telegram",
        gatewayResponse: "rejected",
        ...(accountId ? { accountId } : {}),
        ...(result.pairingCode ? { pairingCode: result.pairingCode } : {}),
      },
    },
    numericId(inbound.messageId),
    numericId(inbound.threadId),
  );
}

function installManagerHandoff(
  manager: TelegramMessageManager,
  gateway: NativeTelegramInboundGateway | GatewayRunner,
  accountId?: string,
): boolean {
  if (!manager.handleMessage || manager[HANDOFF_INSTALLED]) return false;

  manager.handleMessage = async (context) => {
    const inbound = normalizeNativeTelegramMessage(context, accountId);
    if (!inbound) return;
    const result = await gateway.receive(inbound);
    await deliverGatewayRejection(manager, inbound, result, accountId);
  };
  Object.defineProperty(manager, HANDOFF_INSTALLED, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  return true;
}

/**
 * Replaces beta.7 Telegram MessageManager delivery after plugin registration.
 * Telegraf's authorization middleware has already admitted these contexts;
 * Doolittle's gateway exclusively owns downstream pairing and delivery.
 */
export function installNativeTelegramInboundHandoff(
  runtime: { getService: (serviceType: string) => unknown },
  gateway: NativeTelegramInboundGateway | GatewayRunner,
): boolean {
  const service = runtime.getService(
    TELEGRAM_SERVICE,
  ) as TelegramServiceLike | null;
  if (!service || service[HANDOFF_INSTALLED]) return false;

  const installs: boolean[] = [];
  for (const accountId of service.getAccountIds?.() ?? []) {
    const state = service.getAccountState?.(accountId);
    if (!state?.messageManager) continue;
    installs.push(
      installManagerHandoff(
        state.messageManager,
        gateway,
        state.accountId ?? accountId,
      ),
    );
  }
  if (service.messageManager) {
    installs.push(
      installManagerHandoff(service.messageManager, gateway, service.accountId),
    );
  }

  if (!installs.some(Boolean)) return false;
  Object.defineProperty(service, HANDOFF_INSTALLED, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  return true;
}
