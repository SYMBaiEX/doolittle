import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readMediaAudioMetadata,
  readMediaImageDimensions,
  readMediaPdfMetadata,
  readMediaTextMetadata,
} from "./media-metadata";

const ONE_SECOND_WAV = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x6c, 0x3e, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66,
  0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f,
  0x00, 0x00, 0x80, 0x3e, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74,
  0x61, 0x40, 0x3e, 0x00, 0x00,
]);

const ONE_BY_ONE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5X4nQAAAAASUVORK5CYII=";

describe("media metadata readers", () => {
  it("reads image dimensions from PNG, JPG, GIF, WEBP, and SVG payloads", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-image-meta-"));
    try {
      const pngPath = join(root, "one.png");
      const jpgPath = join(root, "one.jpg");
      const gifPath = join(root, "one.gif");
      const webpPath = join(root, "one.webp");
      const svgPath = join(root, "one.svg");

      writeFileSync(pngPath, Buffer.from(ONE_BY_ONE_PNG, "base64"));
      writeFileSync(
        jpgPath,
        Buffer.from([
          0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03,
          0x01, 0x11, 0x00,
        ]),
      );
      writeFileSync(
        gifPath,
        Buffer.from([
          0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x05, 0x00, 0x07, 0x00,
        ]),
      );
      writeFileSync(
        webpPath,
        Buffer.from([
          0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
          0x50, 0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x09, 0x00, 0x00, 0x13, 0x00, 0x00,
        ]),
      );
      writeFileSync(svgPath, '<svg viewBox="0 0 24 36"></svg>');

      expect(readMediaImageDimensions(pngPath, ".png")).toEqual({
        width: 1,
        height: 1,
      });
      expect(readMediaImageDimensions(jpgPath, ".jpg")).toEqual({
        width: 3,
        height: 2,
      });
      expect(readMediaImageDimensions(gifPath, ".gif")).toEqual({
        width: 5,
        height: 7,
      });
      expect(readMediaImageDimensions(webpPath, ".webp")).toEqual({
        width: 10,
        height: 20,
      });
      expect(readMediaImageDimensions(svgPath, ".svg")).toEqual({
        width: 24,
        height: 36,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads text metadata and returns deterministic preview counts", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-text-meta-"));
    try {
      const markdownPath = join(root, "notes.md");
      const binaryPath = join(root, "image.png");

      writeFileSync(markdownPath, "Alpha beta.\nGamma delta.");
      writeFileSync(binaryPath, Buffer.from([0x00, 0xff, 0x00]));

      const textMetadata = readMediaTextMetadata(markdownPath, ".md");
      expect(textMetadata?.lineCount).toBe(2);
      expect(textMetadata?.wordCount).toBe(4);
      expect(textMetadata?.preview).toBe("Alpha beta.\nGamma delta.");
      expect(readMediaTextMetadata(binaryPath, ".png")).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads PDF metadata and wav audio duration metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-pdf-audio-meta-"));
    try {
      const pdfPath = join(root, "doc.pdf");
      const wavPath = join(root, "voice.wav");
      const invalidPdfPath = join(root, "invalid.pdf");

      writeFileSync(
        pdfPath,
        Buffer.from(
          "%PDF-1.4\n1 0 obj << /Type /Catalog >>\n/Title (Engineering Notes) /Author (Test Author)\n2 0 obj << /Type /Page >>\n3 0 obj << /Type /Page >>\n%%EOF",
          "utf8",
        ),
      );
      writeFileSync(wavPath, ONE_SECOND_WAV);
      writeFileSync(invalidPdfPath, "not a pdf file");

      const pdfMetadata = readMediaPdfMetadata(pdfPath);
      expect(pdfMetadata?.pageCount).toBe(2);
      expect(pdfMetadata?.title).toBe("Engineering Notes");
      expect(pdfMetadata?.author).toBe("Test Author");
      expect(pdfMetadata?.preview).toContain("Engineering Notes");

      const audioMetadata = readMediaAudioMetadata(wavPath, ".wav");
      expect(audioMetadata?.durationMs).toBe(996);
      expect(readMediaPdfMetadata(invalidPdfPath)).toBeUndefined();
      expect(readMediaAudioMetadata(wavPath, ".mp3")).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
