import type { GatewayConfig } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import type { TransportPlatform } from "../types";

export function isTransportGatewayEnabled(
  gatewayConfig: GatewayConfig | undefined,
  platform: TransportPlatform,
): boolean {
  return Boolean(gatewayConfig?.platforms[platform].enabled);
}

export function isCustomTransportConfigured(
  platform: TransportPlatform,
  config: EnvConfig,
): boolean {
  switch (platform) {
    case "api":
    case "cli":
      return true;
    case "slack":
      return Boolean(config.slackWebhookUrl && config.slackSigningSecret);
    case "whatsapp":
      return Boolean(
        config.whatsappAccessToken &&
          config.whatsappPhoneNumberId &&
          config.whatsappVerifyToken,
      );
    case "signal":
      return Boolean(config.signalCliCommand);
    case "matrix":
      return Boolean(config.matrixHomeserver && config.matrixAccessToken);
    case "email":
      return Boolean(config.emailSendCommand);
    case "sms":
      return Boolean(config.smsSendCommand);
    case "mattermost":
      return Boolean(config.mattermostUrl && config.mattermostToken);
    case "homeassistant":
      return Boolean(config.homeAssistantUrl && config.homeAssistantToken);
    case "dingtalk":
      return Boolean(config.dingtalkWebhookUrl || config.dingtalkAccessToken);
    case "telegram":
    case "discord":
      return false;
  }
}
