import { describe, expect, it } from "bun:test";
import { createTtsPlugin, TTSGenerationPlugin } from "./index";

describe("TTSGenerationPlugin", () => {
  it("exposes a workspace-native tts plugin descriptor", () => {
    expect(TTSGenerationPlugin.name).toBe("@elizaos/plugin-tts");
    expect(TTSGenerationPlugin.services).toHaveLength(1);
  });

  it("surfaces runtime-backed readiness and speech generation", async () => {
    const plugin = createTtsPlugin({
      speech: {
        status: () => ({
          ready: true,
          backend: "fal",
          mode: "active",
          configured: true,
          detail: "ready",
        }),
        speak: async (text) => ({
          prompt: text,
          artifactKind: "mp3",
        }),
      },
    });

    const TtsService = plugin.services?.[0];
    const service = (await TtsService?.start({} as never)) as
      | {
          status(): unknown;
          speak(text: string): Promise<unknown>;
        }
      | undefined;

    expect(service?.status()).toEqual({
      ready: true,
      backend: "fal",
      mode: "active",
      configured: true,
      detail: "ready",
    });
    expect(await service?.speak("hello")).toEqual({
      prompt: "hello",
      artifactKind: "mp3",
    });
  });
});
