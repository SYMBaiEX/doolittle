import { ModelType } from "@elizaos/core";
import type { RuntimeLike } from "./runtime";

export function getNativeMediaControlPlane(runtime?: RuntimeLike) {
  const ready = Boolean(runtime?.getModel?.(ModelType.TEXT_TO_SPEECH));
  const backend = ready ? ("eliza" as const) : ("none" as const);

  return {
    tts: {
      source: "eliza-model" as const,
      available: true,
      configured: ready,
      provider: backend,
      backend,
      mode: ready ? ("active" as const) : ("degraded" as const),
      pluginAction: "GENERATE_MEDIA",
      preferredFormat: "mp3" as const,
      ready,
      detail: ready
        ? `Eliza ${ModelType.TEXT_TO_SPEECH} is registered and can generate mp3 voice artifacts.`
        : `Eliza ${ModelType.TEXT_TO_SPEECH} has no registered model handler, so voice generation falls back to a degraded SVG concept artifact.`,
    },
  };
}
