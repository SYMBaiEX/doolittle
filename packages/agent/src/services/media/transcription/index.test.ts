import { afterEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("calls the OpenAI transcription endpoint when configured", async () => {
    root = mkdtempSync(join(tmpdir(), "doolittle-transcription-openai-"));
    const outputDir = join(root, "media");
    const audioPath = join(root, "test.wav");
    writeFileSync(audioPath, ONE_SECOND_WAV);

    const originalFetch = globalThis.fetch;
    const requests: string[] = [];

    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        requests.push(url);
        if (url.includes("/audio/transcriptions")) {
          return new Response(
            JSON.stringify({ text: "OpenAI transcribed text." }),
            { status: 200 },
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }) as typeof fetch;

      const modelContext: MediaModelContext = {
        provider: "openai",
        model: "whisper-1",
        baseUrl: "https://example.invalid/v1",
        temperature: 0,
        maxTokens: 128,
        openAiApiKey: "test-key",
      };

      const result = await executeMediaTranscription({
        outputDir,
        path: "test.wav",
        modelContext,
        dependencies: makeDependencies(root),
      });

      expect(result.source).toBe("openai");
      expect(result.transcriptText).toBe("OpenAI transcribed text.");
      expect(requests.some((u) => u.includes("/audio/transcriptions"))).toBe(
        true,
      );
      expect(existsSync(result.transcriptPath)).toBe(true);
      expect(readFileSync(result.transcriptPath, "utf8").trim()).toBe(
        "OpenAI transcribed text.",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to anthropic model text when openai is not available", async () => {
    root = mkdtempSync(join(tmpdir(), "doolittle-transcription-anthropic-"));
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

    expect(result.source).toBe("anthropic");
    expect(result.transcriptText).toBe("Anthropic transcript summary.");
    expect(result.response).toContain("best-effort");
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
