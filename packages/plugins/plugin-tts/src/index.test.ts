import { describe, expect, it } from "bun:test";
import { createTtsPlugin, TTSGenerationPlugin } from "./index";

interface TtsTestService {
  status(): unknown;
  summary(): unknown;
  speak(
    text: string,
    options?: {
      name?: string;
      voice?: string;
      format?: "mp3" | "svg";
      speed?: number;
    },
  ): Promise<unknown>;
  stop(): Promise<void>;
}

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
      | TtsTestService
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

  it("delegates summary to status and supports stop behavior", async () => {
    const plugin = createTtsPlugin({
      speech: {
        status: () => ({
          ready: true,
          backend: "fal",
          mode: "active",
          configured: true,
          detail: "ready",
        }),
        speak: async (text, opts) => ({
          spokenText: text,
          ...opts,
        }),
      },
    });

    const TtsService = plugin.services?.[0];
    const service = (await TtsService?.start({} as never)) as
      | TtsTestService
      | undefined;

    const status = service?.status();
    expect(service?.summary()).toEqual(status);
    expect(
      await service?.speak("hello", { voice: "alloy", format: "svg" }),
    ).toEqual({
      spokenText: "hello",
      voice: "alloy",
      format: "svg",
    });
    await expect(service?.stop()).resolves.toBeUndefined();
  });

  it("reports degraded standalone status for the built-in plugin", async () => {
    const service = (await TTSGenerationPlugin.services?.[0].start(
      {} as never,
    )) as TtsTestService | undefined;
    expect(service?.status()).toEqual({
      ready: false,
      backend: null,
      mode: "degraded",
      configured: false,
      detail:
        "No runtime speech backend is configured for the standalone plugin descriptor.",
    });
    expect(await service?.speak("hello")).toEqual({
      prompt: "hello",
      ready: false,
      backend: null,
      mode: "degraded",
      detail:
        "Speech generation requires the runtime-backed media service and is unavailable in the standalone plugin descriptor.",
    });
  });
});
