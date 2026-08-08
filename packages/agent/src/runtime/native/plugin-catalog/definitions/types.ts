import type {
  NativePluginDescriptor,
  PluginPersistence,
} from "@doolittle/contracts";

export type NativePluginEnablement =
  | "always"
  | "elizaCloud"
  | "ollama"
  | "codex"
  | "claudeCode"
  | "devin"
  | "openai"
  | "anthropic"
  | "telegram"
  | "discord"
  | "whatsapp"
  | "signal"
  | "slack";

export interface NativePluginCatalogSeed
  extends Omit<NativePluginDescriptor, "enabled" | "persistence"> {
  enablement: NativePluginEnablement;
  persistence?: PluginPersistence;
}
