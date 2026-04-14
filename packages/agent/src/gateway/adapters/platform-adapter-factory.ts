import { getNativeMessagingTransportState } from "@/runtime/native/service-bridge/transport-control";
import type { PlatformName } from "@/types/gateway";
import type { PlatformAdapter } from "../platforms/base";
import { DingtalkPlatformAdapter } from "../platforms/dingtalk-adapter";
import { DiscordPlatformAdapter } from "../platforms/discord-adapter";
import { EmailPlatformAdapter } from "../platforms/email-adapter";
import { HomeAssistantPlatformAdapter } from "../platforms/homeassistant-adapter";
import { MatrixPlatformAdapter } from "../platforms/matrix-adapter";
import { MattermostPlatformAdapter } from "../platforms/mattermost-adapter";
import { MockPlatformAdapter } from "../platforms/mock-adapter";
import { SignalPlatformAdapter } from "../platforms/signal-adapter";
import { SlackPlatformAdapter } from "../platforms/slack-adapter";
import { SmsPlatformAdapter } from "../platforms/sms-adapter";
import { TelegramPlatformAdapter } from "../platforms/telegram-adapter";
import { WhatsAppPlatformAdapter } from "../platforms/whatsapp-adapter";
import type { GatewayRunnerContext } from "../runner/context";

export function createPlatformAdapter(
  platform: PlatformName,
  context: GatewayRunnerContext,
): PlatformAdapter {
  if (platform === "telegram") {
    return new TelegramPlatformAdapter(
      platform,
      context.config,
      context.services.delivery,
      () =>
        getNativeMessagingTransportState(
          context.runtime,
          context.config,
          context.services.gatewayConfig,
          platform,
        ),
    );
  }
  if (platform === "discord") {
    return new DiscordPlatformAdapter(
      platform,
      context.config,
      context.services.delivery,
      () =>
        getNativeMessagingTransportState(
          context.runtime,
          context.config,
          context.services.gatewayConfig,
          platform,
        ),
    );
  }
  if (platform === "slack") {
    return new SlackPlatformAdapter(
      platform,
      context.config,
      context.services.delivery,
    );
  }
  if (platform === "whatsapp") {
    return new WhatsAppPlatformAdapter(
      platform,
      context.config,
      context.services.delivery,
    );
  }
  if (platform === "signal") {
    return new SignalPlatformAdapter(
      platform,
      context.config,
      context.services.delivery,
    );
  }
  if (platform === "matrix") {
    return new MatrixPlatformAdapter(
      platform,
      context.config,
      context.services.delivery,
    );
  }
  if (platform === "email") {
    return new EmailPlatformAdapter(
      platform,
      context.config,
      context.services.delivery,
    );
  }
  if (platform === "sms") {
    return new SmsPlatformAdapter(
      platform,
      context.config,
      context.services.delivery,
    );
  }
  if (platform === "mattermost") {
    return new MattermostPlatformAdapter(
      platform,
      context.config,
      context.services.delivery,
    );
  }
  if (platform === "homeassistant") {
    return new HomeAssistantPlatformAdapter(
      platform,
      context.config,
      context.services.delivery,
    );
  }
  if (platform === "dingtalk") {
    return new DingtalkPlatformAdapter(
      platform,
      context.config,
      context.services.delivery,
    );
  }

  return new MockPlatformAdapter(platform, context.services.delivery);
}
