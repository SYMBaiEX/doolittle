import { describe, expect, it } from "bun:test";

import {
  buildMediaAnalysisPrompt,
  formatMediaInspectionDetail,
} from "./analysis";
import {
  buildMediaImageManifest,
  buildMediaImagePrompt,
  buildMediaImageReport,
  buildMediaSpeechManifest,
  buildMediaSpeechPrompt,
  buildMediaSpeechReport,
} from "./generation";
import {
  buildMediaTranscriptionManifest,
  buildMediaTranscriptionPrompt,
  buildMediaTranscriptionReport,
} from "./transcription";

describe("media formatters", () => {
  it("formats inspection details for image, audio, and pdf inputs", () => {
    expect(
      formatMediaInspectionDetail(
        { kind: "image", mimeType: "image/png" } as never,
        { imageDimensions: { width: 320, height: 240 } },
      ),
    ).toContain("320x240");
    expect(
      formatMediaInspectionDetail(
        { kind: "audio", mimeType: "audio/wav" } as never,
        { audioMetadata: { durationMs: 4200 } },
      ),
    ).toContain("4s");
    expect(
      formatMediaInspectionDetail(
        { kind: "document", mimeType: "application/pdf" } as never,
        { structuredMetadata: { preview: "", pageCount: 2, title: "Guide" } },
        ".pdf",
      ),
    ).toContain("Guide");
  });

  it("formats image and speech generation artifacts with stable anchors", () => {
    expect(
      buildMediaImagePrompt("draw a cat", "draw a cinematic cat", {
        style: "ink",
      }),
    ).toContain("Refined Prompt");
    expect(
      buildMediaImageManifest(
        "2026-03-31T00:00:00.000Z",
        "draw a cat",
        "draw a cinematic cat",
        { style: "ink" },
        "offline",
        "offline",
        "/tmp/cat.svg",
        "svg",
      ).artifactPath,
    ).toBe("/tmp/cat.svg");
    expect(
      buildMediaImageReport(
        "draw a cat",
        "draw a cinematic cat",
        undefined,
        "offline",
        "offline",
        "/tmp/cat.svg",
        "svg",
      ),
    ).toContain("Generated locally as an SVG concept artifact.");

    expect(
      buildMediaSpeechPrompt("hello", "alloy", 1.1, "offline", "offline"),
    ).toContain("Voice: alloy");
    expect(
      buildMediaSpeechManifest(
        "2026-03-31T00:00:00.000Z",
        "prompt",
        "refined",
        "script",
        "alloy",
        1.1,
        "offline",
        "offline",
        "/tmp/speech.svg",
        "svg",
        "/tmp/speech-response.txt",
      ).responsePath,
    ).toBe("/tmp/speech-response.txt");
    expect(
      buildMediaSpeechReport(
        "hello",
        "refined",
        "response",
        "offline",
        "offline",
        "alloy",
        "/tmp/speech.svg",
        "svg",
      ),
    ).toContain("# Speech Generation");
  });

  it("formats analysis and transcription prompts and reports", () => {
    const inspection = {
      path: "/tmp/out/voice.wav",
      basename: "voice.wav",
      extension: ".wav",
      sizeBytes: 1024,
      kind: "audio" as const,
      mimeType: "audio/wav",
      exists: true,
      isDirectory: false,
      detail: "Audio file detected with duration about 1s.",
      durationMs: 1000,
      transcriptPreview: "Transcript sidecar preview.",
      captionPreview: "Caption sidecar preview.",
    };
    const bundle = {
      inspection,
      manifestPath: "/tmp/out/media-42-voice.json",
      reportPath: "/tmp/out/media-42-voice.md",
      relatedFiles: ["/tmp/out/voice.transcript.txt"],
    };

    const analysisPrompt = buildMediaAnalysisPrompt(
      inspection,
      bundle,
      "voice",
    );
    expect(analysisPrompt).toContain("voice or audio");
    expect(analysisPrompt).toContain("Transcript sidecar preview.");
    expect(analysisPrompt).toContain(bundle.manifestPath);

    const transcriptionPrompt = buildMediaTranscriptionPrompt(inspection, [
      "Kind: audio",
      "Exists: true",
    ]);
    expect(transcriptionPrompt).toContain(
      "Create a concise Doolittle transcript",
    );
    expect(transcriptionPrompt).toContain("Signals:");

    const manifest = buildMediaTranscriptionManifest(
      "2026-03-29T00:00:00.000Z",
      transcriptionPrompt,
      "hello world",
      "sidecar",
      "offline",
      "offline",
      {
        transcriptPath: "/tmp/out/voice.txt",
        responsePath: "/tmp/out/voice-response.txt",
      },
      inspection,
      bundle,
      "Used a sidecar transcript.",
    );
    expect(manifest.transcriptPath).toBe("/tmp/out/voice.txt");
    expect(manifest.response).toContain("sidecar transcript");

    const report = buildMediaTranscriptionReport(
      inspection,
      transcriptionPrompt,
      "hello world",
      "Used a sidecar transcript.",
      bundle,
      ["Kind: audio", "Exists: true"],
      "offline",
      "offline",
      "sidecar",
    );
    expect(report).toContain("# Transcription: voice.wav");
    expect(report).toContain("hello world");
    expect(report).toContain("Used a sidecar transcript.");
  });
});
