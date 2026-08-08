import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaBundle, MediaInspection, MediaModelContext } from "../types";
import { executeMediaTranscription } from "./index";

const ONE_SECOND_WAV = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x6c, 0x3e, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66,
  0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f,
  0x00, 0x00, 0x80, 0x3e, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74,
  0x61, 0x40, 0x3e, 0x00, 0x00,
]);

function makeInspection(
  root: string,
  overrides: Partial<MediaInspection> = {},
): MediaInspection {
  return {
    path: join(root, "test.wav"),
    basename: "test.wav",
    extension: ".wav",
    sizeBytes: 1024,
    kind: "audio",
    mimeType: "audio/wav",
    exists: true,
    isDirectory: false,
    detail: "Audio file detected with duration about 1s.",
    durationMs: 1000,
    contentHash: "abc123",
    ...overrides,
  };
}

function makeBundle(root: string, inspection: MediaInspection): MediaBundle {
  return {
    inspection,
    manifestPath: join(root, "media", "bundle.json"),
    reportPath: join(root, "media", "bundle.md"),
    relatedFiles: [],
  };
}

function makeDependencies(root: string, inspection?: MediaInspection) {
  const insp = inspection ?? makeInspection(root);
  const bndl = makeBundle(root, insp);
  return {
    inspect: () => insp,
    bundle: () => bndl,
    buildSignals: () => ["Kind: audio", "Exists: true"],
    requestModelText: async (prompt: string) =>
      `Model response for: ${prompt.slice(0, 40)}`,
  };
}

describe("media transcription", () => {
  let root: string;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("produces an offline transcription when no provider is configured", async () => {
    root = mkdtempSync(join(tmpdir(), "doolittle-transcription-offline-"));
    const outputDir = join(root, "media");

    const result = await executeMediaTranscription({
      outputDir,
      path: "test.wav",
      dependencies: makeDependencies(root),
    });

    expect(result.source).toBe("offline");
    expect(result.transcriptText).toContain("Doolittle offline transcript");
    expect(result.provider).toBe("offline");
    expect(result.model).toBe("offline");
    expect(existsSync(result.transcriptPath)).toBe(true);
    expect(existsSync(result.promptPath)).toBe(true);
    expect(existsSync(result.manifestPath)).toBe(true);
    expect(existsSync(result.reportPath)).toBe(true);
  });

  it("uses the sidecar fallback when a transcript file exists", async () => {
    root = mkdtempSync(join(tmpdir(), "doolittle-transcription-sidecar-"));
    const outputDir = join(root, "media");
    const transcriptPath = join(root, "test.transcript.txt");
    writeFileSync(transcriptPath, "Sidecar transcript content.");

    const inspection = makeInspection(root, { transcriptPath });
    const deps = makeDependencies(root, inspection);

    const result = await executeMediaTranscription({
      outputDir,
      path: "test.wav",
      dependencies: deps,
    });

    expect(result.source).toBe("sidecar");
    expect(result.transcriptText).toBe("Sidecar transcript content.");
    expect(result.response).toContain("sidecar");
  });

  it("uses the official Eliza transcription model when available", async () => {
    root = mkdtempSync(join(tmpdir(), "doolittle-transcription-eliza-"));
    const outputDir = join(root, "media");
    const audioPath = join(root, "test.wav");
    writeFileSync(audioPath, ONE_SECOND_WAV);
    const dependencies = makeDependencies(root);
    const requestTranscription = vi.fn(async () => "Eliza transcribed text.");

    const result = await executeMediaTranscription({
      outputDir,
      path: "test.wav",
      dependencies: { ...dependencies, requestTranscription },
    });

    expect(result.source).toBe("eliza");
    expect(result.provider).toBe("eliza");
    expect(result.model).toBe("TRANSCRIPTION");
    expect(result.transcriptText).toBe("Eliza transcribed text.");
    expect(requestTranscription).toHaveBeenCalledWith(audioPath);
    expect(existsSync(result.transcriptPath)).toBe(true);
    expect(readFileSync(result.transcriptPath, "utf8").trim()).toBe(
      "Eliza transcribed text.",
    );
  });

  it("falls back to the selected Eliza text model when transcription is unavailable", async () => {
    root = mkdtempSync(join(tmpdir(), "doolittle-transcription-summary-"));
    const outputDir = join(root, "media");

    const modelContext: MediaModelContext = {
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
      baseUrl: "https://example.invalid",
      temperature: 0.2,
      maxTokens: 128,
      anthropicApiKey: "test-key",
    };

    const deps = makeDependencies(root);
    deps.requestModelText = async () => "Anthropic transcript summary.";

    const result = await executeMediaTranscription({
      outputDir,
      path: "test.wav",
      modelContext,
      dependencies: deps,
    });

    expect(result.source).toBe("model-summary");
    expect(result.transcriptText).toBe("Anthropic transcript summary.");
    expect(result.response).toContain("selected Eliza text model");
  });

  it("writes all artifact files correctly", async () => {
    root = mkdtempSync(join(tmpdir(), "doolittle-transcription-artifacts-"));
    const outputDir = join(root, "media");

    const result = await executeMediaTranscription({
      outputDir,
      path: "test.wav",
      dependencies: makeDependencies(root),
    });

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
    expect(manifest.source).toBe("offline");
    expect(manifest.provider).toBe("offline");

    const promptContent = readFileSync(result.promptPath, "utf8");
    expect(promptContent).toContain("# Transcription Prompt");
    expect(promptContent).toContain("Source: offline");

    const reportContent = readFileSync(result.reportPath, "utf8");
    expect(reportContent).toContain("# Transcription: test.wav");
  });

  it("respects the name option for slug generation", async () => {
    root = mkdtempSync(join(tmpdir(), "doolittle-transcription-name-"));
    const outputDir = join(root, "media");

    const result = await executeMediaTranscription({
      outputDir,
      path: "test.wav",
      options: { name: "custom-label" },
      dependencies: makeDependencies(root),
    });

    expect(result.transcriptPath).toContain("custom-label");
    expect(result.manifestPath).toContain("custom-label");
  });
});
