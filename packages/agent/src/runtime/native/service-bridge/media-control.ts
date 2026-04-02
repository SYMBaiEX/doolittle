import type { EnvConfig } from "@/types/runtime";

export function getNativeMediaControlPlane(config: EnvConfig) {
  const hasFal = Boolean(config.falApiKey?.trim());
  const hasOpenAiSpeech = Boolean(config.openAiApiKey?.trim());
  const ready = hasFal || hasOpenAiSpeech;
  const backend = hasFal
    ? ("fal" as const)
    : hasOpenAiSpeech
      ? ("openai" as const)
      : ("none" as const);

  return {
    tts: {
      source: "native-plugin" as const,
      available: true,
      configured: ready,
      provider: backend,
      backend,
      mode: ready ? ("active" as const) : ("degraded" as const),
      pluginAction: "GENERATE_TTS",
      preferredFormat: "mp3" as const,
      ready,
      detail: hasFal
        ? "Official TTS plugin path is enabled through FAL and can generate mp3 voice artifacts."
        : hasOpenAiSpeech
          ? "Provider-native OpenAI speech generation is available for mp3 voice artifacts."
          : "Official TTS plugin is installed, but no mp3 speech backend is configured, so voice generation falls back to degraded SVG concept output.",
    },
  };
}
