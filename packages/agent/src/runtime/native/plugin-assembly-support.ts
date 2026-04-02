import type { NativePluginDescriptor } from "@doolittle/contracts";
import type { EnvConfig } from "@/types/runtime";
import { listNativePluginCategories } from "./plugin-catalog/index";

export interface NativePluginManagerSummary {
  total: number;
  enabled: number;
  official: number;
  vendored: number;
  providers: number;
  adapters: number;
  experimental: number;
  placeholders: number;
  injectedPersistence: number;
  categories: number;
}

export interface NativeSpeechStatus {
  ready: boolean;
  backend: "fal" | "openai" | null;
  mode: "active" | "degraded";
  configured: boolean;
  detail: string;
}

export function buildNativePluginManagerSummary(
  catalog: NativePluginDescriptor[],
): NativePluginManagerSummary {
  return {
    total: catalog.length,
    enabled: catalog.filter((entry) => entry.enabled).length,
    official: catalog.filter((entry) => entry.source === "official").length,
    vendored: catalog.filter((entry) => entry.source === "vendored").length,
    providers: catalog.filter((entry) => entry.kind === "provider").length,
    adapters: catalog.filter((entry) => entry.kind === "adapter").length,
    experimental: catalog.filter((entry) => entry.maturity === "experimental")
      .length,
    placeholders: catalog.filter((entry) => entry.maturity === "placeholder")
      .length,
    injectedPersistence: catalog.filter(
      (entry) => entry.persistence === "injected",
    ).length,
    categories: listNativePluginCategories().length,
  };
}

export function describeNativeSpeechStatus(
  config: EnvConfig,
): NativeSpeechStatus {
  const hasFal = Boolean(config.falApiKey?.trim());
  const hasOpenAiSpeech = Boolean(config.openAiApiKey?.trim());

  return {
    ready: hasFal || hasOpenAiSpeech,
    backend: hasFal ? "fal" : hasOpenAiSpeech ? "openai" : null,
    mode:
      hasFal || hasOpenAiSpeech ? ("active" as const) : ("degraded" as const),
    configured: hasFal || hasOpenAiSpeech,
    detail: hasFal
      ? "Speech generation is routed through the FAL-backed TTS path."
      : hasOpenAiSpeech
        ? "Speech generation is routed through the provider-native OpenAI speech path."
        : "No mp3 speech backend is configured, so the plugin remains available in degraded SVG fallback mode.",
  };
}
