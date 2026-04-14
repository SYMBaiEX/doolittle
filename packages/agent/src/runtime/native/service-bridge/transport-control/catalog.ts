import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type { EnvConfig } from "@/types/runtime";
import type { NativePluginEntry } from "./types";

export function getMessagingPluginCatalog(
  config: EnvConfig,
): NativePluginEntry[] {
  return getNativePluginCatalog(config).filter(
    (entry: { category?: string }) => entry.category === "messaging",
  );
}

export function getMessagingTransportPlugins(config: EnvConfig): {
  telegramPlugin: NativePluginEntry | undefined;
  discordPlugin: NativePluginEntry | undefined;
} {
  const catalog = getMessagingPluginCatalog(config);
  return {
    telegramPlugin: catalog.find((entry) => entry.id === "messaging.telegram"),
    discordPlugin: catalog.find((entry) => entry.id === "messaging.discord"),
  };
}
