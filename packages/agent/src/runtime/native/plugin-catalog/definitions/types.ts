import type {
  NativePluginDescriptor,
  PluginPersistence,
} from "@doolittle/contracts";

export type NativePluginEnablement =
  | "always"
  | "elizaCloud"
  | "codex"
  | "claudeCode"
  | "openai"
  | "anthropic"
  | "telegram"
  | "discord";

export interface NativePluginCatalogSeed
  extends Omit<NativePluginDescriptor, "enabled" | "persistence"> {
  enablement: NativePluginEnablement;
  persistence?: PluginPersistence;
}
