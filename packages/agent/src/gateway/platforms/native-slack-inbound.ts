import { normalizeInboundMessage } from "@/gateway/message-normalization";
import type { GatewayRunner } from "@/gateway/runner";
import type { IncomingPlatformMessage } from "@/types/gateway";

const SLACK_SERVICE = "slack";
const HANDOFF_INSTALLED = Symbol.for(
  "doolittle.gateway.native-slack-inbound-handoff",
);

type SlackEvent = {
  type?: string;
  subtype?: string;
  bot_id?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  ts?: string;
  thread_ts?: string;
};

type SlackAccountSettings = {
  shouldIgnoreBotMessages?: boolean;
  shouldRespondOnlyToMentions?: boolean;
};

type SlackServiceLike = {
  runtime?: {
    getSetting?: (key: string) => unknown;
  };
  handleMessage?: (
    message: SlackEvent,
    client: unknown,
    accountId?: string,
  ) => Promise<void>;
  handleAppMention?: (
    event: SlackEvent,
    client: unknown,
    accountId?: string,
  ) => Promise<void>;
  getAllowedChannelIds?: (accountId?: string | null) => string[];
  getSettingsForAccount?: (accountId?: string) => SlackAccountSettings;
  getBotUserId?: () => string | null;
  getBotUserIdForAccount?: (accountId: string) => string | null;
  sendMessage?: (
    channelId: string,
    text: string,
    options?: { threadTs?: string; replyBroadcast?: boolean },
    accountId?: string | null,
  ) => Promise<unknown>;
  [HANDOFF_INSTALLED]?: boolean;
};

export interface NativeSlackInboundGateway {
  receive(message: IncomingPlatformMessage): Promise<{
    ok: boolean;
    response?: string;
    pairingCode?: string;
    agentCompleted?: boolean;
    deliveryStatus?: "sent" | "fallback" | "rejected";
  }>;
}

function isTruthySetting(value: unknown): boolean {
  return value === true || value === "true";
}

function getBotUserIdForInboundAccount(
  service: SlackServiceLike,
  accountId?: string,
): string | null | undefined {
  return accountId
    ? (service.getBotUserIdForAccount?.(accountId) ?? service.getBotUserId?.())
    : service.getBotUserId?.();
}

function getSlackSettingsForInboundAccount(
  service: SlackServiceLike,
  accountId?: string,
): SlackAccountSettings {
  const accountSettings = service.getSettingsForAccount?.(accountId);
  return {
    shouldIgnoreBotMessages:
      accountSettings?.shouldIgnoreBotMessages ??
      isTruthySetting(
        service.runtime?.getSetting?.("SLACK_SHOULD_IGNORE_BOT_MESSAGES"),
      ),
    shouldRespondOnlyToMentions:
      accountSettings?.shouldRespondOnlyToMentions ??
      isTruthySetting(
        service.runtime?.getSetting?.("SLACK_SHOULD_RESPOND_ONLY_TO_MENTIONS"),
      ),
  };
}

function isSlackBotMention(
  service: SlackServiceLike,
  event: SlackEvent,
  accountId?: string,
): boolean {
  const botUserId = getBotUserIdForInboundAccount(service, accountId);
  return Boolean(botUserId && event.text?.includes(`<@${botUserId}>`));
}

function shouldIgnoreSlackMessage(
  service: SlackServiceLike,
  event: SlackEvent,
  accountId?: string,
): boolean {
  const botUserId = getBotUserIdForInboundAccount(service, accountId);
  if (event.user && event.user === botUserId) return true;

  const settings = getSlackSettingsForInboundAccount(service, accountId);
  if (settings.shouldIgnoreBotMessages && event.bot_id) return true;

  const allowedChannels = service.getAllowedChannelIds?.(accountId) ?? [];
  if (allowedChannels.length > 0 && event.channel) {
    if (!allowedChannels.includes(event.channel)) return true;
  }

  const isMentioned = Boolean(
    botUserId && event.text?.includes(`<@${botUserId}>`),
  );
  if (
    event.type === "message" &&
    settings.shouldRespondOnlyToMentions &&
    !isMentioned
  ) {
    return true;
  }

  return false;
}

function normalizeNativeSlackEvent(
  service: SlackServiceLike,
  event: SlackEvent,
  accountId?: string,
): IncomingPlatformMessage | null {
  if (
    (event.type === "message" || event.type === "app_mention") &&
    shouldIgnoreSlackMessage(service, event, accountId)
  ) {
    return null;
  }

  // The shared Slack parser intentionally excludes bot_message events. Native
  // inbound follows the pinned service's account policy, which can allow them.
  const senderId =
    event.type === "app_mention" ? event.user : (event.user ?? event.bot_id);
  const normalized =
    event.type === "app_mention" || event.subtype === "bot_message"
      ? senderId && event.channel && event.text && event.ts
        ? {
            platform: "slack" as const,
            userId: senderId,
            roomId: event.channel,
            text: event.text,
            channelId: event.channel,
            threadId: event.thread_ts,
            messageId: event.ts,
            channelType: event.channel_type,
          }
        : null
      : normalizeInboundMessage("slack", { event });

  if (!normalized) return null;
  return {
    ...normalized,
    metadata: {
      ...(normalized.metadata ?? {}),
      nativeConnector: "slack",
      ...(accountId ? { accountId } : {}),
      ...(event.type === "app_mention"
        ? { slackEventType: "app_mention" }
        : {}),
    },
  };
}

/**
 * Bridges beta.7 Socket Mode callbacks into Doolittle's gateway receive path.
 * The pinned Slack plugin has no inbound MessageConnector hook: its private
 * handlers are invoked dynamically by Bolt, so wrapping those methods after
 * deferred registration is the smallest compatibility boundary. Slack's own
 * filtering remains in this seam; authorization, sessions, traces, inbox, and
 * delivery are then owned by Doolittle's gateway.
 */
export function installNativeSlackInboundHandoff(
  runtime: {
    getService: (serviceType: string) => unknown;
  },
  gateway: NativeSlackInboundGateway | GatewayRunner,
): boolean {
  const service = runtime.getService(SLACK_SERVICE) as SlackServiceLike | null;
  if (!service?.handleMessage || service[HANDOFF_INSTALLED]) return false;

  service.handleMessage = async function (message, _client, accountId) {
    // Slack emits both a message event and app_mention for channel mentions.
    // Let the dedicated handler own those events so the gateway sees one turn.
    if (
      message.channel_type !== "im" &&
      this.handleAppMention &&
      isSlackBotMention(this, message, accountId)
    ) {
      return;
    }
    const inbound = normalizeNativeSlackEvent(this, message, accountId);
    if (!inbound) return;
    const result = await gateway.receive(inbound);
    if (result.ok || result.agentCompleted || !result.response?.trim()) return;
    await this.sendMessage?.(
      inbound.roomId,
      result.response,
      { threadTs: inbound.threadId ?? inbound.messageId },
      accountId,
    );
  };

  if (service.handleAppMention) {
    service.handleAppMention = async function (event, _client, accountId) {
      const inbound = normalizeNativeSlackEvent(
        this,
        {
          ...event,
          type: "app_mention",
        },
        accountId,
      );
      if (!inbound) return;
      const result = await gateway.receive(inbound);
      if (result.ok || result.agentCompleted || !result.response?.trim())
        return;
      await this.sendMessage?.(
        inbound.roomId,
        result.response,
        { threadTs: inbound.threadId ?? inbound.messageId },
        accountId,
      );
    };
  }

  Object.defineProperty(service, HANDOFF_INSTALLED, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });

  return true;
}

export { normalizeNativeSlackEvent };
