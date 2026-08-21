import type { Plugin } from "@elizaos/core";
import { normalizePlugin } from "../support";
import type { DeferredPluginGroupContext } from "./shared";

export async function loadDeferredMessagingPlugins({
  config,
}: DeferredPluginGroupContext): Promise<Plugin[]> {
  const imports: Promise<Plugin>[] = [];

  if (
    process.env.DOOLITTLE_DISTRIBUTED_DESKTOP_RUNTIME !== "1" &&
    config.telegramBotToken
  )
    imports.push(
      import("@elizaos/plugin-telegram").then(({ default: plugin }) =>
        normalizePlugin(plugin),
      ),
    );
  if (config.discordBotToken)
    imports.push(
      import("@elizaos/plugin-discord").then(({ default: plugin }) =>
        normalizePlugin(plugin),
      ),
    );
  if (
    process.env.DOOLITTLE_DISTRIBUTED_DESKTOP_RUNTIME !== "1" &&
    config.whatsappAccessToken &&
    config.whatsappPhoneNumberId &&
    config.whatsappVerifyToken
  )
    imports.push(
      import("@elizaos/plugin-whatsapp").then(({ default: plugin }) =>
        normalizePlugin(plugin),
      ),
    );
  if (config.signalAccountNumber)
    imports.push(
      import("@elizaos/plugin-signal").then(({ default: plugin }) =>
        normalizePlugin(plugin),
      ),
    );
  if (config.slackBotToken && config.slackAppToken)
    imports.push(
      import("@elizaos/plugin-slack").then(({ default: plugin }) =>
        normalizePlugin(plugin),
      ),
    );

  return Promise.all(imports);
}
