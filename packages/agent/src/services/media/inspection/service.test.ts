import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaInspectionSupport } from "./service";

const ONE_BY_ONE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5X4nQAAAAASUVORK5CYII=";
const ONE_SECOND_WAV = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x6c, 0x3e, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66,
  0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f,
  0x00, 0x00, 0x80, 0x3e, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74,
  0x61, 0x40, 0x3e, 0x00, 0x00,
]);

describe("MediaInspectionSupport", () => {
  it("inspects media files and emits bundle artifacts through the extracted seam", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-inspection-"));
    const outputDir = join(root, "media");
    const support = new MediaInspectionSupport(root, outputDir);
    const audioPath = join(root, "meeting.wav");
    const transcriptPath = join(root, "meeting.transcript.txt");

    try {
      writeFileSync(audioPath, ONE_SECOND_WAV);
      writeFileSync(transcriptPath, "Meeting transcript for inspection seam.");

      const inspection = support.inspect("meeting.wav");
      expect(inspection.kind).toBe("audio");
      expect(inspection.transcriptPath).toBe(transcriptPath);

      const bundle = support.bundle("meeting.wav");
      expect(
        bundle.relatedFiles.some((entry) =>
          entry.endsWith("meeting.transcript.txt"),
        ),
      ).toBe(true);
      expect(existsSync(bundle.manifestPath)).toBe(true);
      expect(existsSync(bundle.reportPath)).toBe(true);

      const signals = support.buildSignals(inspection);
      expect(signals).toContain("Kind: audio");
      expect(signals.some((entry) => entry.startsWith("Transcript: "))).toBe(
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves document previews and image dimensions through the extracted support class", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-media-inspection-docs-"),
    );
    const outputDir = join(root, "media");
    const support = new MediaInspectionSupport(root, outputDir);

    try {
      writeFileSync(
        join(root, "notes.md"),
        "# Hello\n\nThis is a sample note.",
      );
      writeFileSync(
        join(root, "icon.png"),
        Buffer.from(ONE_BY_ONE_PNG, "base64"),
      );

      const notes = support.inspect("notes.md");
      expect(notes.textPreview).toContain("Hello");
      expect(notes.wordCount).toBeGreaterThan(0);

      const icon = support.inspect("icon.png");
      expect(icon.width).toBe(1);
      expect(icon.height).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
