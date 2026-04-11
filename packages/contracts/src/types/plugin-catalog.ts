export type PluginKind = "provider" | "vendored" | "adapter";

export type PluginMaturity =
  | "production"
  | "alpha"
  | "experimental"
  | "placeholder";

export type PluginPersistence = "injected" | "none";

export type PluginSource = "official" | "vendored" | "custom";

export type NativePluginCategory =
  | "foundation"
  | "providers"
  | "messaging"
  | "knowledge"
  | "browser"
  | "media"
  | "research"
  | "execution"
  | "integration"
  | "automation"
  | "product";

export interface NativePluginDescriptor {
  id: string;
  packageName: string;
  category: NativePluginCategory;
  source: PluginSource;
  kind: PluginKind;
  maturity: PluginMaturity;
  persistence: PluginPersistence;
  enabled: boolean;
  notes: string;
}
