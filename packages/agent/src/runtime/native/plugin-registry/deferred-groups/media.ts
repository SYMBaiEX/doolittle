import type { Plugin } from "@elizaos/core";
import { describeNativeSpeechStatus } from "../../plugin-assembly-support";
import type { DeferredPluginGroupContext } from "./shared";

export async function loadDeferredMediaPlugins({
  services,
  config,
}: DeferredPluginGroupContext): Promise<Plugin[]> {
  const { createTtsPlugin } = await import("@elizaos/plugin-tts");

  return [
    createTtsPlugin({
      speech: {
        status: () => describeNativeSpeechStatus(config),
        speak: (text, options) => services.media.speakWithModel(text, options),
      },
    }),
  ];
}
