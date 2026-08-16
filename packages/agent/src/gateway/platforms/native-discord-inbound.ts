import { normalizeInboundMessage } from "@/gateway/message-normalization";
import type { GatewayRunner } from "@/gateway/runner";
import type { IncomingPlatformMessage } from "@/types/gateway";

const DISCORD_SERVICE = "discord";
const HANDOFF_INSTALLED = Symbol.for(
  "doolittle.gateway.native-discord-inbound-handoff",
);

type DiscordAttachment = {
  id?: string;
  name?: string;
  filename?: string;
  url?: string;
  proxyURL?: string;
  proxy_url?: string;
  contentType?: string;
  content_type?: string;
  size?: number;
  height?: number;
  width?: number;
};

type DiscordMessage = {
  content?: string;
  id?: string;
  author?: {
    id?: string;
    username?: string;
    globalName?: string | null;
    bot?: boolean;
  };
  channel?: {
    id?: string;
    type?: string | number;
    parentId?: string | null;
    isDMBased?: () => boolean;
    isThread?: () => boolean;
    send?: (content: {
      content: string;
      reply?: { messageReference: string };
    }) => Promise<unknown>;
  };
  guildId?: string | null;
  guild?: { id?: string } | null;
  reference?: { messageId?: string | null } | null;
  message_reference?: { message_id?: string };
  createdTimestamp?: number;
  createdAt?: Date | string;
  attachments?:
    | DiscordAttachment[]
    | { values?: () => IterableIterator<DiscordAttachment> };
};

type DiscordSettings = {
  shouldIgnoreBotMessages?: boolean;
  shouldIgnoreDirectMessages?: boolean;
  shouldRespondOnlyToMentions?: boolean;
};

type DiscordServiceLike = {
  accountId?: string;
  client?: { user?: { id?: string } | null } | null;
  discordSettings?: DiscordSettings;
  allowedChannelIds?: readonly string[] | null;
  isChannelAllowed?: (channelId: string, accountId?: string) => boolean;
  messageManager?: DiscordMessageManager;
  getAccountIds?: () => string[];
  getAccountState?: (accountId: string) => {
    accountId?: string;
    client?: DiscordServiceLike["client"];
    settings?: DiscordSettings;
    allowedChannelIds?: readonly string[] | null;
    messageManager?: DiscordMessageManager;
  } | null;
  [HANDOFF_INSTALLED]?: boolean;
};

type DiscordMessageManager = {
  handleMessage?: (message: DiscordMessage) => Promise<void>;
  [HANDOFF_INSTALLED]?: boolean;
};

export interface NativeDiscordInboundGateway {
  receive(message: IncomingPlatformMessage): Promise<{
    ok: boolean;
    response?: string;
    pairingCode?: string;
    agentCompleted?: boolean;
    deliveryStatus?: "sent" | "fallback" | "rejected";
  }>;
}

function isDm(message: DiscordMessage): boolean {
  const channel = message.channel;
  if (!channel) return false;
  if (typeof channel.isDMBased === "function") return channel.isDMBased();
  return (
    channel.type === "DM" ||
    channel.type === "GROUP_DM" ||
    channel.type === 1 ||
    channel.type === 3
  );
}

function isThread(message: DiscordMessage): boolean {
  return typeof message.channel?.isThread === "function"
    ? message.channel.isThread()
    : Boolean(message.channel?.parentId);
}

function isDiscordAttachment(value: unknown): value is DiscordAttachment {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function attachmentValues(
  attachments: DiscordMessage["attachments"],
): DiscordAttachment[] {
  if (Array.isArray(attachments))
    return attachments.filter(isDiscordAttachment);
  if (attachments && typeof attachments.values === "function") {
    return [...attachments.values()].filter(isDiscordAttachment);
  }
  return [];
}

function usableString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function attachmentLocator(attachment: DiscordAttachment): string | undefined {
  return (
    usableString(attachment.url) ??
    usableString(attachment.proxyURL) ??
    usableString(attachment.proxy_url)
  );
}

function toParserPayload(message: DiscordMessage): Record<string, unknown> {
  const referenceId =
    message.reference?.messageId ?? message.message_reference?.message_id;
  const threadId = isThread(message) ? message.channel?.id : undefined;
  const content = typeof message.content === "string" ? message.content : "";
  return {
    content: content.trim() ? content : "",
    channel_id: message.channel?.id,
    id: message.id,
    author: message.author
      ? {
          id: message.author.id,
          username: message.author.username ?? message.author.globalName,
          bot: message.author.bot,
        }
      : undefined,
    message_reference: referenceId ? { message_id: referenceId } : undefined,
    guild_id: message.guildId ?? message.guild?.id,
    thread_id: threadId,
    attachments: attachmentValues(message.attachments).map((attachment) => ({
      id: usableString(attachment.id),
      filename:
        usableString(attachment.name) ?? usableString(attachment.filename),
      url: attachmentLocator(attachment),
      content_type:
        usableString(attachment.contentType) ??
        usableString(attachment.content_type),
      size: attachment.size,
      height: attachment.height,
      width: attachment.width,
    })),
  };
}

function shouldIgnoreDiscordMessage(
  service: DiscordServiceLike,
  message: DiscordMessage,
): boolean {
  const authorId = message.author?.id;
  const content = typeof message.content === "string" ? message.content : "";
  const hasValidAttachment = attachmentValues(message.attachments).some(
    (attachment) => Boolean(attachmentLocator(attachment)),
  );
  if (
    !authorId ||
    !message.channel?.id ||
    (!content.trim() && !hasValidAttachment)
  ) {
    return true;
  }

  const botUserId = service.client?.user?.id;
  if (botUserId && authorId === botUserId) return true;

  const settings = service.discordSettings ?? {};
  if (message.author?.bot && settings.shouldIgnoreBotMessages) return true;

  const directMessage = isDm(message);
  if (directMessage && settings.shouldIgnoreDirectMessages) return true;

  const allowedChannelIds = service.allowedChannelIds;
  if (
    allowedChannelIds &&
    allowedChannelIds.length > 0 &&
    service.isChannelAllowed
  ) {
    const channelAllowed = service.isChannelAllowed(message.channel.id);
    const parentAllowed = Boolean(
      message.channel.parentId &&
        isThread(message) &&
        service.isChannelAllowed(message.channel.parentId),
    );
    if (!channelAllowed && !parentAllowed) return true;
  }

  if (settings.shouldRespondOnlyToMentions && !directMessage) {
    const mentioned =
      Boolean(botUserId) &&
      (content.includes(`<@${botUserId}>`) ||
        content.includes(`<@!${botUserId}>`));
    if (!mentioned) return true;
  }

  return false;
}

function serviceForAccount(
  service: DiscordServiceLike,
  accountId?: string,
): DiscordServiceLike {
  if (!accountId || !service.getAccountState) return service;
  const state = service.getAccountState(accountId);
  if (!state) return service;
  return {
    accountId: state.accountId ?? accountId,
    client: state.client,
    discordSettings: state.settings,
    allowedChannelIds: state.allowedChannelIds,
    isChannelAllowed: (channelId) =>
      service.isChannelAllowed?.(channelId, accountId) ?? false,
  };
}

export function normalizeNativeDiscordMessage(
  service: DiscordServiceLike,
  message: DiscordMessage,
  accountId?: string,
): IncomingPlatformMessage | null {
  if (shouldIgnoreDiscordMessage(service, message)) return null;
  const normalized = normalizeInboundMessage(
    "discord",
    toParserPayload(message),
  );
  if (!normalized) return null;

  const createdAt =
    message.createdAt instanceof Date
      ? message.createdAt.toISOString()
      : typeof message.createdAt === "string"
        ? message.createdAt
        : typeof message.createdTimestamp === "number"
          ? new Date(message.createdTimestamp).toISOString()
          : undefined;
  return {
    ...normalized,
    ...(createdAt ? { timestamp: createdAt } : {}),
    metadata: {
      ...(normalized.metadata ?? {}),
      nativeConnector: "discord",
      ...(accountId ? { accountId } : {}),
    },
  };
}

function installManagerHandoff(
  manager: DiscordMessageManager,
  service: DiscordServiceLike,
  gateway: NativeDiscordInboundGateway | GatewayRunner,
  accountId?: string,
): boolean {
  if (!manager.handleMessage || manager[HANDOFF_INSTALLED]) return false;
  manager.handleMessage = async (message) => {
    const inbound = normalizeNativeDiscordMessage(service, message, accountId);
    if (!inbound) return;
    const result = await gateway.receive(inbound);
    if (
      result.ok ||
      result.agentCompleted ||
      !result.response?.trim() ||
      !message.channel?.send
    ) {
      return;
    }
    await message.channel.send({
      content: result.response,
      ...(inbound.messageId
        ? { reply: { messageReference: inbound.messageId } }
        : {}),
    });
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
 * Routes the pinned Discord plugin's native message-manager callbacks through
 * Doolittle's gateway policy. The plugin owns Discord transport and debouncing;
 * the gateway owns pairing, sessions, traces, inbox records, and delivery.
 */
export function installNativeDiscordInboundHandoff(
  runtime: {
    getService: (serviceType: string) => unknown;
  },
  gateway: NativeDiscordInboundGateway | GatewayRunner,
): boolean {
  const service = runtime.getService(
    DISCORD_SERVICE,
  ) as DiscordServiceLike | null;
  if (!service || service[HANDOFF_INSTALLED]) return false;

  const installs: boolean[] = [];
  const accountIds = service.getAccountIds?.() ?? [];
  for (const accountId of accountIds) {
    const state = service.getAccountState?.(accountId);
    if (!state?.messageManager) continue;
    installs.push(
      installManagerHandoff(
        state.messageManager,
        serviceForAccount(service, accountId),
        gateway,
        accountId,
      ),
    );
  }

  if (service.messageManager) {
    installs.push(
      installManagerHandoff(
        service.messageManager,
        service,
        gateway,
        service.accountId,
      ),
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
