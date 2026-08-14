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
  getBotUserId?: () => string | null;
  [HANDOFF_INSTALLED]?: boolean;
};

export interface NativeSlackInboundGateway {
  receive(message: IncomingPlatformMessage): Promise<{ ok: boolean }>;
}

function isTruthySetting(value: unknown): boolean {
  return value === true || value === "true";
}

function shouldIgnoreSlackMessage(
  service: SlackServiceLike,
  event: SlackEvent,
  accountId?: string,
): boolean {
  if (event.subtype === "bot_message") return true;
  const botUserId = service.getBotUserId?.();
  if (event.user && event.user === botUserId) return true;

  const ignoreBotMessages = isTruthySetting(
    service.runtime?.getSetting?.("SLACK_SHOULD_IGNORE_BOT_MESSAGES"),
  );
  if (ignoreBotMessages && event.bot_id) return true;

  const allowedChannels = service.getAllowedChannelIds?.(accountId) ?? [];
  if (allowedChannels.length > 0 && event.channel) {
    if (!allowedChannels.includes(event.channel)) return true;
  }

  const isMentioned = Boolean(
    botUserId && event.text?.includes(`<@${botUserId}>`),
  );
  const onlyMentions = isTruthySetting(
    service.runtime?.getSetting?.("SLACK_SHOULD_RESPOND_ONLY_TO_MENTIONS"),
  );
  if (onlyMentions && event.channel_type !== "im" && !isMentioned) {
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
    event.type === "message" &&
    shouldIgnoreSlackMessage(service, event, accountId)
  ) {
    return null;
  }

  const normalized =
    event.type === "app_mention"
      ? event.user && event.channel && event.text && event.ts
        ? {
            platform: "slack" as const,
            userId: event.user,
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
    const inbound = normalizeNativeSlackEvent(this, message, accountId);
    if (!inbound) return;
    await gateway.receive(inbound);
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
      await gateway.receive(inbound);
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
