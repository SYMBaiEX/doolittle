import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelType, ServiceType } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { MediaService } from "./service";
import type { MediaTextAnalysisPort } from "./types";

const ONE_BY_ONE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5X4nQAAAAASUVORK5CYII=";
const ONE_SECOND_WAV = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x6c, 0x3e, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66,
  0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f,
  0x00, 0x00, 0x80, 0x3e, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74,
  0x61, 0x40, 0x3e, 0x00, 0x00,
]);

describe("MediaService", () => {
  it("returns missing-file metadata without throwing", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-missing-"));
    const service = new MediaService(root);

    try {
      const inspection = service.inspect("missing.png");
      expect(inspection.exists).toBe(false);
      expect(inspection.detail).toContain("does not exist");
      expect(inspection.mimeType).toBe("image/png");
      expect(inspection.contentHash).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects image dimensions for png files", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-png-"));
    const service = new MediaService(root);
    const path = join(root, "icon.png");

    try {
      writeFileSync(path, Buffer.from(ONE_BY_ONE_PNG, "base64"));
      const inspection = service.inspect("icon.png");
      expect(inspection.exists).toBe(true);
      expect(inspection.kind).toBe("image");
      expect(inspection.width).toBe(1);
      expect(inspection.height).toBe(1);
      expect(inspection.detail).toContain("1x1");
      expect(inspection.contentHash).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("adds preview and counters for text files", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-text-"));
    const service = new MediaService(root);
    const path = join(root, "notes.md");

    try {
      writeFileSync(path, "# Hello\n\nThis is a sample note.");
      const inspection = service.inspect("notes.md");
      expect(inspection.kind).toBe("document");
      expect(inspection.lineCount).toBeGreaterThan(0);
      expect(inspection.wordCount).toBeGreaterThan(0);
      expect(inspection.textPreview).toContain("Hello");
      expect(inspection.contentHash).toBeDefined();
      expect(inspection.detail).toContain("words");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("extracts readable previews from html and csv documents", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-docs-"));
    const service = new MediaService(root);
    const htmlPath = join(root, "page.html");
    const csvPath = join(root, "table.csv");

    try {
      writeFileSync(
        htmlPath,
        "<html><head><title>Doc</title></head><body><h1>Heading</h1><p>Paragraph</p></body></html>",
      );
      const htmlInspection = service.inspect("page.html");
      expect(htmlInspection.kind).toBe("document");
      expect(htmlInspection.textPreview).toContain("Heading");
      expect(htmlInspection.textPreview).toContain("Paragraph");
      expect(htmlInspection.detail).toContain("words");

      writeFileSync(csvPath, "name,value\nalpha,1\nbeta,2\ngamma,3");
      const csvInspection = service.inspect("table.csv");
      expect(csvInspection.kind).toBe("document");
      expect(csvInspection.textPreview).toContain("name,value");
      expect(csvInspection.textPreview).toContain("alpha,1");
      expect(csvInspection.lineCount).toBe(4);
      expect(csvInspection.wordCount).toBeGreaterThan(0);
      expect(csvInspection.contentHash).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects best-effort pdf metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-pdf-"));
    const service = new MediaService(root);
    const pdfPath = join(root, "briefing.pdf");

    try {
      writeFileSync(
        pdfPath,
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 2 >>\nendobj\n3 0 obj\n<< /Title (Eliza Briefing) /Author (Doolittle) >>\nendobj\n4 0 obj\n<< /Type /Page >>\nendobj\n5 0 obj\n<< /Type /Page >>\nendobj\n%%EOF",
        "latin1",
      );
      const inspection = service.inspect("briefing.pdf");
      expect(inspection.kind).toBe("document");
      expect(inspection.detail).toContain("PDF detected");
      expect(inspection.pageCount).toBeGreaterThanOrEqual(2);
      expect(inspection.title).toBe("Eliza Briefing");
      expect(inspection.author).toBe("Doolittle");
      expect(inspection.textPreview).toContain("Eliza Briefing");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects audio duration and transcript sidecars", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-audio-"));
    const service = new MediaService(root);
    const audioPath = join(root, "memo.wav");
    const transcriptPath = join(root, "memo.transcript.txt");

    try {
      writeFileSync(audioPath, ONE_SECOND_WAV);
      writeFileSync(
        transcriptPath,
        "This is a transcript sidecar for a voice memo.",
      );
      const inspection = service.inspect("memo.wav");
      expect(inspection.kind).toBe("audio");
      expect(inspection.durationMs).toBeGreaterThanOrEqual(900);
      expect(inspection.transcriptPath).toBe(transcriptPath);
      expect(inspection.transcriptPreview).toContain("voice memo");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects image caption sidecars", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-caption-"));
    const service = new MediaService(root);
    const imagePath = join(root, "scene.png");
    const captionPath = join(root, "scene.caption.txt");

    try {
      writeFileSync(imagePath, Buffer.from(ONE_BY_ONE_PNG, "base64"));
      writeFileSync(
        captionPath,
        "A minimal placeholder scene used for screenshot regression checks.",
      );
      const inspection = service.inspect("scene.png");
      expect(inspection.captionPath).toBe(captionPath);
      expect(inspection.captionPreview).toContain("screenshot regression");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates a reusable media bundle with related sidecars", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-bundle-"));
    const service = new MediaService(root);
    const audioPath = join(root, "meeting.wav");
    const transcriptPath = join(root, "meeting.transcript.txt");
    const captionPath = join(root, "meeting.caption.txt");

    try {
      writeFileSync(audioPath, ONE_SECOND_WAV);
      writeFileSync(
        transcriptPath,
        "Meeting transcript content for the bundle report.",
      );
      writeFileSync(captionPath, "Caption sidecar for the bundle report.");

      const bundle = service.bundle("meeting.wav");
      expect(bundle.inspection.kind).toBe("audio");
      expect(
        bundle.relatedFiles.some((entry) =>
          entry.endsWith("meeting.transcript.txt"),
        ),
      ).toBe(true);
      expect(
        bundle.relatedFiles.some((entry) =>
          entry.endsWith("meeting.caption.txt"),
        ),
      ).toBe(true);
      expect(bundle.reportPath).toContain("media-");
      expect(bundle.manifestPath).toContain("media-");
      expect(existsSync(bundle.reportPath)).toBe(true);
      expect(existsSync(bundle.manifestPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("builds model-ready analysis briefs for audio and image media", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-analyze-"));
    const service = new MediaService(root);
    const audioPath = join(root, "voice.wav");
    const transcriptPath = join(root, "voice.transcript.txt");
    const imagePath = join(root, "scene.png");
    const captionPath = join(root, "scene.caption.txt");

    try {
      writeFileSync(audioPath, ONE_SECOND_WAV);
      writeFileSync(
        transcriptPath,
        "Voice memo transcript about a launch plan and next steps.",
      );
      writeFileSync(imagePath, Buffer.from(ONE_BY_ONE_PNG, "base64"));
      writeFileSync(
        captionPath,
        "A small sample image used for visual analysis.",
      );

      const audioAnalysis = service.analyze("voice.wav");
      expect(audioAnalysis.focus).toBe("voice");
      expect(audioAnalysis.prompt).toContain("voice or audio");
      expect(audioAnalysis.prompt).toContain("Voice memo transcript");
      expect(audioAnalysis.signals).toContain("Kind: audio");

      const imageAnalysis = service.vision("scene.png");
      expect(imageAnalysis.focus).toBe("vision");
      expect(imageAnalysis.prompt).toContain("vision or image");
      expect(imageAnalysis.prompt).toContain("concise, actionable analysis");
      expect(
        imageAnalysis.signals.some((signal) => signal.startsWith("Caption: ")),
      ).toBe(true);
      expect(existsSync(audioAnalysis.bundle.manifestPath)).toBe(true);
      expect(existsSync(imageAnalysis.bundle.reportPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates model-assisted analysis artifacts with the offline fallback", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-analysis-"));
    const service = new MediaService(root);
    const audioPath = join(root, "briefing.wav");

    try {
      writeFileSync(audioPath, ONE_SECOND_WAV);
      const analysis = await service.analyzeWithModel("briefing.wav");
      expect(analysis.analysis.focus).toBe("voice");
      expect(analysis.response).toContain("Offline analysis");
      expect(existsSync(analysis.reportPath)).toBe(true);
      expect(existsSync(analysis.responsePath)).toBe(true);
      expect(existsSync(analysis.manifestPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("transcribes media in offline mode via the public transcribe API", async () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-media-transcribe-offline-"),
    );
    const service = new MediaService(root, join(root, "media"));
    const audioPath = join(root, "briefing.wav");

    try {
      writeFileSync(audioPath, ONE_SECOND_WAV);

      const transcription = await service.transcribe("briefing.wav", {
        name: "offline-audio",
        prompt: "Create a concise transcript.",
        language: "en",
      });

      expect(transcription.source).toBe("offline");
      expect(transcription.provider).toBe("offline");
      expect(transcription.model).toBe("offline");
      expect(transcription.transcriptText).toContain(
        "Doolittle offline transcript",
      );
      expect(transcription.transcriptPath).toContain("offline-audio");
      expect(existsSync(transcription.transcriptPath)).toBe(true);
      expect(existsSync(transcription.promptPath)).toBe(true);
      expect(existsSync(transcription.reportPath)).toBe(true);
      expect(existsSync(transcription.manifestPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates transcription and speech artifacts through Eliza model handlers", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-audio-native-"));
    const service = new MediaService(root, join(root, "media"), () => ({
      provider: "openai",
      model: "gpt-4.1-mini",
      baseUrl: "https://example.invalid/v1",
      temperature: 0.2,
      maxTokens: 128,
      openAiApiKey: "test-key",
      openAiImageModel: "gpt-image-1",
    }));
    const audioPath = join(root, "briefing.wav");
    const useModel = vi.fn(async (modelType: string) => {
      if (modelType === ModelType.TRANSCRIPTION) {
        return "Doolittle transcript from Eliza audio.";
      }
      if (modelType === ModelType.TEXT_TO_SPEECH) {
        return new Uint8Array(Buffer.from("ID3doolittle-speech"));
      }
      throw new Error(`Unexpected model: ${modelType}`);
    });
    service.bindRuntime({
      getModel: vi.fn(() => useModel),
      getService: vi.fn(() => null),
      useModel,
    } as never);

    try {
      writeFileSync(audioPath, ONE_SECOND_WAV);
      const transcription = await service.transcribeWithModel("briefing.wav");
      const speech = await service.speakWithModel(
        "Doolittle speaks with clarity.",
      );

      expect(transcription.source).toBe("eliza");
      expect(transcription.provider).toBe("eliza");
      expect(transcription.model).toBe(ModelType.TRANSCRIPTION);
      expect(transcription.transcriptText).toContain("Eliza audio");
      expect(existsSync(transcription.transcriptPath)).toBe(true);
      expect(existsSync(transcription.reportPath)).toBe(true);
      expect(existsSync(transcription.manifestPath)).toBe(true);
      expect(speech.artifactKind).toBe("mp3");
      expect(existsSync(speech.artifactPath)).toBe(true);
      expect(existsSync(speech.reportPath)).toBe(true);
      expect(speech.provider).toBe("eliza");
      expect(speech.model).toBe(ModelType.TEXT_TO_SPEECH);
      expect(useModel).toHaveBeenCalledWith(
        ModelType.TRANSCRIPTION,
        expect.any(Buffer),
      );
      expect(useModel).toHaveBeenCalledWith(ModelType.TEXT_TO_SPEECH, {
        text: expect.any(String),
        voice: "alloy",
        speed: undefined,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts streamed audio results from the official Eliza TTS model", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-tts-stream-"));
    const service = new MediaService(root, join(root, "media"));
    const bytes = new Uint8Array(Buffer.from("ID3doolittle-streamed-tts"));
    const useModel = vi.fn(async () => ({
      audioStream: (async function* () {
        yield bytes;
      })(),
      bytes: Promise.resolve(bytes),
      mimeType: "audio/mpeg",
    }));
    service.bindRuntime({
      getModel: vi.fn(() => useModel),
      getService: vi.fn(() => null),
      useModel,
    } as never);

    try {
      const speech = await service.speakWithModel("Doolittle native TTS.", {
        format: "mp3",
      });

      expect(speech.artifactKind).toBe("mp3");
      expect(speech.response).toContain(ModelType.TEXT_TO_SPEECH);
      expect(existsSync(speech.artifactPath)).toBe(true);
      expect(useModel).toHaveBeenCalledOnce();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("generates a fallback svg concept image without a provider", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-image-"));
    const service = new MediaService(root);

    try {
      const generation = await service.generateImage(
        "a luminous skyline over the Eliza workspace",
      );
      expect(generation.artifactKind).toBe("svg");
      expect(generation.artifactPath.endsWith(".svg")).toBe(true);
      expect(existsSync(generation.artifactPath)).toBe(true);
      expect(existsSync(generation.promptPath)).toBe(true);
      expect(existsSync(generation.reportPath)).toBe(true);
      expect(existsSync(generation.manifestPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back from the Eliza media service to the official image model", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-image-model-"));
    const service = new MediaService(root, join(root, "media"));
    const useModel = vi.fn(async () => [
      { url: `data:image/png;base64,${ONE_BY_ONE_PNG}` },
    ]);
    service.bindRuntime({
      getModel: vi.fn((modelType: string) =>
        modelType === ModelType.IMAGE ? useModel : undefined,
      ),
      getService: vi.fn(() => ({
        canGenerateMedia: vi.fn(async () => true),
        generateMedia: vi.fn(async () => {
          throw new Error("configured media service is unavailable");
        }),
      })),
      useModel,
    } as never);

    try {
      const generation = await service.generateImage("A compact Eliza icon");

      expect(generation.artifactKind).toBe("png");
      expect(generation.provider).toBe("eliza");
      expect(generation.model).toBe(ModelType.IMAGE);
      expect(useModel).toHaveBeenCalledWith(ModelType.IMAGE, {
        prompt: expect.any(String),
        count: 1,
        size: "1024x1024",
      });
      expect(existsSync(generation.artifactPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("routes all model-assisted media text through the injected runtime port", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-provider-"));
    const textAnalysisPort: MediaTextAnalysisPort = {
      bindRuntime: vi.fn(),
      analyze: vi.fn(async () => "Runtime-backed media summary."),
    };
    const service = new MediaService(
      root,
      join(root, "media"),
      () => ({
        provider: "openai",
        model: "gpt-4.1-mini",
        baseUrl: "https://example.invalid/v1",
        temperature: 0.2,
        maxTokens: 128,
        openAiApiKey: "test-key",
        openAiImageModel: "gpt-image-1",
      }),
      textAnalysisPort,
    );
    const generateMedia = vi.fn(async () => ({
      mediaType: "image" as const,
      imageBase64: ONE_BY_ONE_PNG,
      mimeType: "image/png",
    }));
    service.bindRuntime({
      getModel: vi.fn(() => undefined),
      getService: vi.fn((serviceType: string) =>
        serviceType === ServiceType.MEDIA_GENERATION
          ? {
              canGenerateMedia: vi.fn(async () => true),
              generateMedia,
            }
          : null,
      ),
      useModel: vi.fn(),
    } as never);
    const audioPath = join(root, "voice.wav");

    try {
      writeFileSync(audioPath, ONE_SECOND_WAV);
      const analysis = await service.analyzeWithModel("voice.wav");

      expect(analysis.response).toContain("Runtime-backed media summary");
      expect(textAnalysisPort.analyze).toHaveBeenCalledWith(
        expect.stringContaining("concise, actionable analysis"),
      );
      const generation = await service.generateImage(
        "A compact dashboard icon",
      );
      expect(textAnalysisPort.analyze).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("Create a concise image-generation brief"),
      );
      expect(generation.artifactKind).toBe("png");
      expect(existsSync(generation.artifactPath)).toBe(true);
      expect(generation.provider).toBe("eliza");
      expect(generation.model).toBe(ModelType.IMAGE);
      expect(generateMedia).toHaveBeenCalledWith({
        mediaType: "image",
        prompt: "Runtime-backed media summary.",
        size: "1024x1024",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses the runtime text port for provider-backed transcription fallback", async () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-media-transcript-port-"),
    );
    const originalFetch = globalThis.fetch;
    const textAnalysisPort: MediaTextAnalysisPort = {
      bindRuntime: vi.fn(),
      analyze: vi.fn(async () => "Runtime-backed transcript summary."),
    };
    const service = new MediaService(
      root,
      join(root, "media"),
      () => ({
        provider: "anthropic",
        model: "claude-sonnet",
        baseUrl: "https://example.invalid",
        temperature: 0.2,
        maxTokens: 128,
        anthropicApiKey: "test-key",
      }),
      textAnalysisPort,
    );

    try {
      globalThis.fetch = vi.fn(async () => {
        throw new Error("text analysis must not use provider HTTP");
      }) as typeof fetch;
      writeFileSync(join(root, "voice.wav"), ONE_SECOND_WAV);

      const transcription = await service.transcribe("voice.wav");

      expect(transcription.source).toBe("model-summary");
      expect(transcription.transcriptText).toBe(
        "Runtime-backed transcript summary.",
      );
      expect(textAnalysisPort.analyze).toHaveBeenCalledWith(
        expect.stringContaining("transcription"),
      );
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves injected text-analysis failures", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-analysis-error-"));
    const failure = new Error("selected model unavailable");
    const textAnalysisPort: MediaTextAnalysisPort = {
      bindRuntime: vi.fn(),
      analyze: vi.fn(async () => {
        throw failure;
      }),
    };
    const service = new MediaService(
      root,
      join(root, "media"),
      undefined,
      textAnalysisPort,
    );

    try {
      writeFileSync(join(root, "voice.wav"), ONE_SECOND_WAV);
      await expect(service.analyzeWithModel("voice.wav")).rejects.toBe(failure);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
