import type { Plugin } from "@elizaos/core";
import { normalizePlugin } from "../support";
import type { DeferredPluginGroupContext } from "./shared";

export async function loadDeferredMessagingPlugins({
  config,
}: DeferredPluginGroupContext): Promise<Plugin[]> {
  const messaging: Plugin[] = [];

  if (config.telegramBotToken) {
    const { default: telegramPlugin } = await import(
      "@elizaos/plugin-telegram"
    );
    messaging.push(normalizePlugin(telegramPlugin));
  }

  if (config.discordBotToken) {
    const { default: discordPlugin } = await import("@elizaos/plugin-discord");
    messaging.push(normalizePlugin(discordPlugin));
  }

  if (
    config.whatsappAccessToken &&
    config.whatsappPhoneNumberId &&
    config.whatsappVerifyToken
  ) {
    const { default: whatsappPlugin } = await import(
      "@elizaos/plugin-whatsapp"
    );
    messaging.push(normalizePlugin(whatsappPlugin));
  }

  if (config.signalAccountNumber) {
    const { default: signalPlugin } = await import("@elizaos/plugin-signal");
    messaging.push(normalizePlugin(signalPlugin));
  }

  if (config.slackBotToken && config.slackAppToken) {
    const { default: slackPlugin } = await import("@elizaos/plugin-slack");
    messaging.push(normalizePlugin(slackPlugin));
  }

  return messaging;
}
