import { describe, expect, it } from "bun:test";
import {
  buildMediaAnalysisPaths,
  buildMediaBundlePaths,
  buildMediaGenerationPaths,
  buildMediaSpeechPaths,
  buildMediaTranscriptionPaths,
  slugifyMediaPath,
  slugifyMediaText,
} from "./index";

describe("media paths", () => {
  it("builds stable stamped paths and slugs", () => {
    expect(slugifyMediaPath("./media/Example File.png")).toBe(
      "media-example-file-png",
    );
    expect(slugifyMediaText("  Spoken narration demo  ")).toBe(
      "spoken-narration-demo",
    );

    expect(buildMediaBundlePaths("/tmp/out", 42, "bundle")).toEqual({
      manifestPath: "/tmp/out/media-42-bundle.json",
      reportPath: "/tmp/out/media-42-bundle.md",
    });
    expect(buildMediaAnalysisPaths("/tmp/out", 42, "analysis")).toEqual({
      manifestPath: "/tmp/out/media-42-analysis.json",
      reportPath: "/tmp/out/media-42-analysis.md",
      responsePath: "/tmp/out/media-42-analysis-analysis-response.md",
    });
    expect(buildMediaTranscriptionPaths("/tmp/out", 42, "voice")).toEqual({
      promptPath: "/tmp/out/media-42-voice-transcription-prompt.md",
      manifestPath: "/tmp/out/media-42-voice-transcription.json",
      reportPath: "/tmp/out/media-42-voice-transcription.md",
      transcriptPath: "/tmp/out/media-42-voice-transcript.txt",
      responsePath: "/tmp/out/media-42-voice-transcription-response.txt",
    });
    expect(buildMediaGenerationPaths("/tmp/out", 42, "image")).toEqual({
      promptPath: "/tmp/out/media-42-image-prompt.md",
      manifestPath: "/tmp/out/media-42-image-generation.json",
      reportPath: "/tmp/out/media-42-image-generation.md",
      artifactPath: "/tmp/out/media-42-image.svg",
    });
    expect(buildMediaSpeechPaths("/tmp/out", 42, "speech")).toEqual({
      promptPath: "/tmp/out/media-42-speech-speech-prompt.md",
      manifestPath: "/tmp/out/media-42-speech-speech.json",
      reportPath: "/tmp/out/media-42-speech-speech.md",
      artifactPath: "/tmp/out/media-42-speech-speech.svg",
      responsePath: "/tmp/out/media-42-speech-speech-response.txt",
    });
  });
});
