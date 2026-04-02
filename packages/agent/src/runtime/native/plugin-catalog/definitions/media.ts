import type { NativePluginCatalogSeed } from "./types";

export const MEDIA_PLUGIN_CATALOG_SEEDS: NativePluginCatalogSeed[] = [
  {
    id: "media.tts",
    packageName: "@elizaos/plugin-tts",
    category: "media",
    source: "vendored",
    kind: "adapter",
    maturity: "alpha",
    persistence: "injected",
    enablement: "always",
    notes:
      "Workspace-native TTS adapter over Doolittle media generation with degraded readiness when no speech backend is configured.",
  },
];
