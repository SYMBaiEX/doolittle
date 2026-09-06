import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listMediaLibraryAssets,
  MediaLibraryError,
  readMediaLibraryAsset,
} from "./library";

describe("media library", () => {
  let outputDir = "";

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), "doolittle-media-library-"));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it("indexes generated assets and returns a bounded preview payload", () => {
    const imagePath = join(outputDir, "diagram.png");
    const speechPath = join(outputDir, "briefing.mp3");
    writeFileSync(imagePath, Buffer.from("image"));
    writeFileSync(speechPath, Buffer.from("audio"));
    writeFileSync(
      join(outputDir, "diagram-generation.json"),
      JSON.stringify({
        artifactPath: imagePath,
        createdAt: "2026-09-05T12:00:00.000Z",
        prompt: "Draw the system",
        provider: "openai",
        model: "gpt-image-1",
      }),
    );
    writeFileSync(
      join(outputDir, "briefing-speech.json"),
      JSON.stringify({
        artifactPath: speechPath,
        createdAt: "2026-09-05T13:00:00.000Z",
        prompt: "Read the briefing",
        provider: "openai",
        model: "tts-1",
      }),
    );

    const assets = listMediaLibraryAssets(outputDir);

    expect(assets.map((asset) => asset.id)).toEqual([
      "briefing-speech",
      "diagram-generation",
    ]);
    expect(assets[0]).toMatchObject({
      kind: "audio",
      mimeType: "audio/mpeg",
      name: "briefing.mp3",
      prompt: "Read the briefing",
    });
    expect(readMediaLibraryAsset(outputDir, "diagram-generation")).toEqual({
      asset: expect.objectContaining({
        id: "diagram-generation",
        kind: "image",
        mimeType: "image/png",
      }),
      encoding: "base64",
      content: Buffer.from("image").toString("base64"),
    });
  });

  it("ignores malformed, linked, and outside-library artifacts", () => {
    const outsidePath = `${outputDir}-outside.png`;
    const linkedPath = join(outputDir, "linked.png");
    writeFileSync(outsidePath, Buffer.from("outside"));
    symlinkSync(outsidePath, linkedPath);
    writeFileSync(join(outputDir, "broken-generation.json"), "{");
    writeFileSync(
      join(outputDir, "outside-generation.json"),
      JSON.stringify({ artifactPath: outsidePath }),
    );
    writeFileSync(
      join(outputDir, "linked-generation.json"),
      JSON.stringify({ artifactPath: linkedPath }),
    );

    expect(listMediaLibraryAssets(outputDir)).toEqual([]);
    rmSync(outsidePath, { force: true });
  });

  it("rejects invalid and missing asset ids", () => {
    expect(() => readMediaLibraryAsset(outputDir, "../secret")).toThrow(
      MediaLibraryError,
    );
    expect(() =>
      readMediaLibraryAsset(outputDir, "missing-generation"),
    ).toThrow(/not found/i);
  });
});
