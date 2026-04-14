import { describe, expect, it } from "bun:test";

import type {
  MediaAnalysisBundle,
  MediaBundle,
  MediaInspection,
} from "../types";
import {
  buildMediaAnalysisManifest,
  buildMediaAnalysisPrompt,
  buildMediaAnalysisReport,
  buildMediaAnalysisResponseSummary,
  buildMediaBundleManifest,
  buildMediaBundleReport,
  formatMediaInspectionDetail,
} from "./analysis";

const inspection: MediaInspection = {
  path: "/tmp/media/video.mp4",
  basename: "video.mp4",
  extension: ".mp4",
  sizeBytes: 4096,
  kind: "video",
  mimeType: "video/mp4",
  exists: true,
  isDirectory: false,
  detail: "Video file detected with 2s duration.",
  width: 1280,
  height: 720,
  durationMs: 1500,
  transcriptPath: "/tmp/media/video.transcript.txt",
  captionPath: "/tmp/media/video.caption.txt",
};

const bundle: MediaBundle = {
  inspection,
  manifestPath: "/tmp/media/video-manifest.json",
  reportPath: "/tmp/media/video-report.md",
  relatedFiles: [
    "/tmp/media/video.transcript.txt",
    "/tmp/media/video.caption.txt",
  ],
};

const analysis: MediaAnalysisBundle = {
  focus: "vision",
  inspection,
  bundle,
  prompt: "analyze video sequence",
  signals: ["Kind: video", "MIME: video/mp4", "Duration: 2s"],
};

describe("analysis formatter", () => {
  it("formats detail strings by media shape and extension", () => {
    expect(
      formatMediaInspectionDetail(
        { kind: "image", mimeType: "image/png" },
        { imageDimensions: { width: 12, height: 34 } },
      ),
    ).toContain("12x34");
    expect(
      formatMediaInspectionDetail(
        { kind: "audio", mimeType: "audio/wav" },
        { audioMetadata: { durationMs: 2800 } },
      ),
    ).toContain("3s");
    expect(
      formatMediaInspectionDetail(
        { kind: "document", mimeType: "application/pdf" },
        { structuredMetadata: { preview: "", pageCount: 6, title: "Spec" } },
        ".pdf",
      ),
    ).toContain("with about 6 pages");
    expect(
      formatMediaInspectionDetail(
        { kind: "document", mimeType: "text/plain" },
        { structuredMetadata: { preview: "line one" } },
      ),
    ).toContain("Detected as document");
    expect(
      formatMediaInspectionDetail({
        kind: "unknown",
        mimeType: "application/unknown",
      }),
    ).toContain("Detected as unknown");
  });

  it("builds media bundle manifest and report with stable file lines", () => {
    const manifest = buildMediaBundleManifest(
      "2026-04-11T00:00:00.000Z",
      inspection,
      bundle.relatedFiles,
    );
    expect(manifest.createdAt).toBe("2026-04-11T00:00:00.000Z");
    expect(manifest.relatedFiles).toEqual(bundle.relatedFiles);
    expect(manifest.inspection).toBe(inspection);

    const report = buildMediaBundleReport(inspection, bundle.relatedFiles);
    expect(report).toContain("Path: /tmp/media/video.mp4");
    expect(report).toContain("Kind: video");
    expect(report).toContain("Dimensions: 1280x720");
    expect(report).toContain("- Transcript: /tmp/media/video.transcript.txt");
    expect(report).toContain("- /tmp/media/video.transcript.txt");
  });

  it("builds analysis manifest, prompt, report, and response summary", () => {
    const manifest = buildMediaAnalysisManifest(
      "2026-04-11T00:00:00.000Z",
      analysis,
      "Looks good.",
      "offline",
      "mock-model",
    );
    expect(manifest.createdAt).toBe("2026-04-11T00:00:00.000Z");
    expect(manifest.response).toBe("Looks good.");

    const finalPrompt = buildMediaAnalysisPrompt(
      {
        ...inspection,
        detail: "Video content with caption and transcript.",
        textPreview: "text",
        transcriptPreview: "primary transcript preview",
      },
      {
        ...bundle,
        relatedFiles: ["/tmp/media/video.transcript.txt"],
      },
      "vision",
    );
    expect(finalPrompt).toContain("vision or image");
    expect(finalPrompt).toContain("Manifest: /tmp/media/video-manifest.json");
    expect(finalPrompt).toContain("Transcript sidecar:");

    const preview = "A".repeat(2600);
    const longPrompt = buildMediaAnalysisPrompt(
      {
        ...inspection,
        detail: "Video content with long preview.",
        textPreview: preview,
      },
      {
        ...bundle,
        relatedFiles: [],
      },
      "research",
    );
    const promptTail = longPrompt.trimEnd().split("\n").at(-1);
    expect(promptTail?.length).toBe(2400);

    const report = buildMediaAnalysisReport(
      analysis,
      "Looks good.",
      "offline",
      "mock-model",
    );
    expect(report).toContain("# Media Analysis: video.mp4");
    expect(report).toContain("Bundle manifest: /tmp/media/video-manifest.json");
    expect(report).toContain("## Signals");
    expect(report).toContain("## Prompt");

    expect(
      buildMediaAnalysisResponseSummary(analysis, "offline", "mock-model"),
    ).toContain("video.mp4 using offline/mock-model");
  });
});
