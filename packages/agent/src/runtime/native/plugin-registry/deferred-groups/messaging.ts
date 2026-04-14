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

  const { createDiscordPlugin } = await import("@elizaos/plugin-discord");
  messaging.push(
    createDiscordPlugin({
      enabled: Boolean(config.discordBotToken),
      tokenConfigured: Boolean(config.discordBotToken),
    }),
  );

  return messaging;
}
