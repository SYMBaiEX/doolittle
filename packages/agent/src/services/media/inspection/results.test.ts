import { describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getMediaMimeType } from "./readers";
import {
  buildDirectoryMediaInspection,
  buildMediaInspectionSignals,
  buildMissingMediaInspection,
  inspectResolvedMediaFile,
} from "./results";

const ONE_BY_ONE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5X4nQAAAAASUVORK5CYII=";
const ONE_SECOND_WAV = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x6c, 0x3e, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66,
  0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f,
  0x00, 0x00, 0x80, 0x3e, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74,
  0x61, 0x40, 0x3e, 0x00, 0x00,
]);

describe("media inspection results", () => {
  it("builds missing and directory inspection results", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-media-inspection-paths-"),
    );
    const missingPath = join(root, "missing.png");
    const directoryPath = join(root, "assets");

    try {
      mkdirSync(directoryPath);

      const missing = buildMissingMediaInspection(
        missingPath,
        ".png",
        getMediaMimeType(".png"),
      );
      expect(missing.exists).toBe(false);
      expect(missing.detail).toContain("does not exist");
      expect(missing.mimeType).toBe("image/png");

      const directory = buildDirectoryMediaInspection(
        directoryPath,
        "",
        statSync(directoryPath).size,
      );
      expect(directory.exists).toBe(true);
      expect(directory.isDirectory).toBe(true);
      expect(directory.mimeType).toBe("inode/directory");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("builds structured inspection output for resolved media files", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-media-inspection-file-"),
    );
    const audioPath = join(root, "meeting.wav");
    const transcriptPath = join(root, "meeting.transcript.txt");
    const imagePath = join(root, "icon.png");

    try {
      writeFileSync(audioPath, ONE_SECOND_WAV);
      writeFileSync(transcriptPath, "Meeting transcript from helper.");
      writeFileSync(imagePath, Buffer.from(ONE_BY_ONE_PNG, "base64"));

      const audioInspection = inspectResolvedMediaFile({
        resolvedPath: audioPath,
        extension: ".wav",
        mimeType: getMediaMimeType(".wav"),
        sizeBytes: statSync(audioPath).size,
      });
      expect(audioInspection.kind).toBe("audio");
      expect(audioInspection.durationMs).toBeGreaterThanOrEqual(900);
      expect(audioInspection.transcriptPath).toBe(transcriptPath);
      expect(audioInspection.contentHash).toBeDefined();

      const imageInspection = inspectResolvedMediaFile({
        resolvedPath: imagePath,
        extension: ".png",
        mimeType: getMediaMimeType(".png"),
        sizeBytes: statSync(imagePath).size,
      });
      expect(imageInspection.kind).toBe("image");
      expect(imageInspection.width).toBe(1);
      expect(imageInspection.height).toBe(1);
      expect(imageInspection.detail).toContain("1x1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("formats signal lines from inspection metadata", () => {
    const signals = buildMediaInspectionSignals({
      path: "/tmp/meeting.wav",
      basename: "meeting.wav",
      extension: ".wav",
      sizeBytes: 128,
      kind: "audio",
      mimeType: "audio/wav",
      exists: true,
      isDirectory: false,
      detail: "Audio file.",
      durationMs: 1200,
      transcriptPath: "/tmp/meeting.transcript.txt",
    });

    expect(signals).toContain("Kind: audio");
    expect(signals).toContain("MIME: audio/wav");
    expect(signals).toContain("Duration: 1s");
    expect(signals.some((entry) => entry.startsWith("Transcript: "))).toBe(
      true,
    );
  });
});
