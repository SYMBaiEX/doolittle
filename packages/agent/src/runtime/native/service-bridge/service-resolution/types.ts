export interface EffectiveServiceResolutionRecord {
  capability: string;
  nativeService: string;
  source: "native" | "unavailable";
  ownership: "plugin";
  requirement: string;
  available: boolean;
}

export interface NativePluginManagerSummary {
  total: number;
  enabled: number;
  official: number;
  vendored: number;
  categories: number;
}
