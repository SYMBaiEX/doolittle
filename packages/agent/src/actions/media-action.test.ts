import type { Memory } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { createMediaActions, DOOLITTLE_MEDIA_ACTIONS } from "./media-action";

const message = { content: { text: "Create an asset" } } as Memory;
const runtime = {} as never;

function createMedia() {
  return {
    generateImage: vi.fn(async () => ({
      artifactPath: "/assets/image.png",
      manifestPath: "/assets/image.json",
      provider: "eliza",
      model: "image-model",
    })),
    speak: vi.fn(async () => ({
      artifactPath: "/assets/speech.mp3",
      manifestPath: "/assets/speech.json",
      provider: "eliza",
      model: "speech-model",
    })),
    transcribe: vi.fn(async () => ({
      transcriptPath: "/assets/transcript.md",
      manifestPath: "/assets/transcript.json",
      provider: "eliza",
      model: "transcription-model",
      source: "eliza",
    })),
    analyzeWithModel: vi.fn(async () => ({
      reportPath: "/assets/report.md",
      manifestPath: "/assets/report.json",
      provider: "eliza",
      model: "analysis-model",
      analysis: { focus: "vision" },
    })),
  };
}

describe("Eliza-native Doolittle media actions", () => {
  it("registers one planner action for each media capability", () => {
    const actions = createMediaActions({ media: createMedia() } as never);
    expect(actions.map((action) => action.name)).toEqual([
      ...DOOLITTLE_MEDIA_ACTIONS,
    ]);
    expect(actions.every((action) => action.parameters?.length)).toBe(true);
  });

  it("generates images through the shared media service", async () => {
    const media = createMedia();
    const action = createMediaActions({ media } as never)[0];
    const result = await action.handler(runtime, message, undefined, {
      parameters: {
        prompt: "A compact terminal icon",
        name: "terminal-icon",
        size: "1024x1024",
        style: "minimal",
      },
    });

    expect(media.generateImage).toHaveBeenCalledWith(
      "A compact terminal icon",
      expect.objectContaining({
        name: "terminal-icon",
        size: "1024x1024",
        style: "minimal",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      verifiedUserFacing: true,
      data: {
        actionName: "DOOLITTLE_GENERATE_IMAGE",
        artifactPath: "/assets/image.png",
      },
    });
  });

  it("routes speech, transcription, and analysis through durable services", async () => {
    const media = createMedia();
    const actions = createMediaActions({ media } as never);

    const speech = await actions[1].handler(runtime, message, undefined, {
      parameters: { text: "Ship it", voice: "alloy", speed: 1.2 },
    });
    const transcription = await actions[2].handler(
      runtime,
      message,
      undefined,
      {
        parameters: { path: "recording.wav", language: "en" },
      },
    );
    const analysis = await actions[3].handler(runtime, message, undefined, {
      parameters: { path: "screen.png", focus: "vision" },
    });

    expect(media.speak).toHaveBeenCalledWith(
      "Ship it",
      expect.objectContaining({ voice: "alloy", speed: 1.2 }),
    );
    expect(media.transcribe).toHaveBeenCalledWith(
      "recording.wav",
      expect.objectContaining({ language: "en" }),
    );
    expect(media.analyzeWithModel).toHaveBeenCalledWith(
      "screen.png",
      "vision",
      undefined,
    );
    expect(speech).toMatchObject({
      data: { actionName: "DOOLITTLE_GENERATE_SPEECH" },
    });
    expect(transcription).toMatchObject({
      data: { actionName: "DOOLITTLE_TRANSCRIBE_MEDIA" },
    });
    expect(analysis).toMatchObject({
      data: {
        actionName: "DOOLITTLE_ANALYZE_MEDIA",
        focus: "vision",
      },
    });
  });

  it("returns useful failures for missing input and provider errors", async () => {
    const media = createMedia();
    media.generateImage.mockRejectedValueOnce(new Error("provider offline"));
    const action = createMediaActions({ media } as never)[0];

    await expect(
      action.handler(runtime, message, undefined, { parameters: {} }),
    ).resolves.toMatchObject({
      success: false,
      text: "Media action requires a prompt.",
    });
    await expect(
      action.handler(runtime, message, undefined, {
        parameters: { prompt: "test" },
      }),
    ).resolves.toMatchObject({
      success: false,
      text: "Media operation failed: provider offline",
    });
  });
});
