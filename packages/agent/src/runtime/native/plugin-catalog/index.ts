import type {
  NativePluginCategory,
  NativePluginDescriptor,
  PluginPersistence,
} from "@doolittle/contracts";
import type { EnvConfig } from "@/types/runtime";
import { describeAutonomousAlignment } from "../autonomous-stack";
import {
  getNativePluginCatalogSeeds,
  NATIVE_PLUGIN_CATEGORIES,
  type NativePluginEnablement,
} from "./definitions";

function enabled(value: unknown): boolean {
  return Boolean(value);
}

function definePluginDescriptor(
  input: Omit<NativePluginDescriptor, "persistence"> & {
    persistence?: PluginPersistence;
  },
): NativePluginDescriptor {
  return {
    ...input,
    persistence: input.persistence ?? "none",
  };
}

function resolveNativePluginEnablement(
  enablement: NativePluginEnablement,
  config: EnvConfig,
): boolean {
  switch (enablement) {
    case "always":
      return true;
    case "elizaCloud":
      return enabled(config.elizaCloudApiKey) || config.elizaCloudEnabled;
    case "codex":
      return config.useLinkedCodexAuth;
    case "claudeCode":
      return config.useLinkedClaudeCodeAuth;
    case "openai":
      return enabled(config.openAiApiKey);
    case "anthropic":
      return enabled(config.anthropicApiKey);
    case "telegram":
      return enabled(config.telegramBotToken);
    case "discord":
      return enabled(config.discordBotToken);
  }
}

export function getNativePluginCatalog(
  config: EnvConfig,
): NativePluginDescriptor[] {
  const autonomous = describeAutonomousAlignment();
  return getNativePluginCatalogSeeds(autonomous.foundationPackages).map(
    (entry) =>
      definePluginDescriptor({
        ...entry,
        enabled: resolveNativePluginEnablement(entry.enablement, config),
      }),
  );
}

export type NativePluginCatalog = ReturnType<typeof getNativePluginCatalog>;

export function groupNativePluginCatalog(
  catalog: NativePluginDescriptor[],
): Record<NativePluginCategory, NativePluginDescriptor[]> {
  return Object.fromEntries(
    NATIVE_PLUGIN_CATEGORIES.map((category) => [
      category,
      catalog.filter((entry) => entry.category === category),
    ]),
  ) as Record<NativePluginCategory, NativePluginDescriptor[]>;
}

export type NativePluginCatalogGroups = ReturnType<
  typeof groupNativePluginCatalog
>;

export function listNativePluginCategories(): NativePluginCategory[] {
  return [...NATIVE_PLUGIN_CATEGORIES];
}
