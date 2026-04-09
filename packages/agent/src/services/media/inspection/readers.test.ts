import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildMediaPreview,
  detectMediaKind,
  getMediaMimeType,
  listMediaRelatedFiles,
  readMediaAudioMetadata,
} from "./readers";

const ONE_SECOND_WAV = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x6c, 0x3e, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66,
  0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x40, 0x1f,
  0x00, 0x00, 0x80, 0x3e, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74,
  0x61, 0x40, 0x3e, 0x00, 0x00,
]);

describe("media inspection readers", () => {
  it("detects kinds, mime types, and previews", () => {
    expect(detectMediaKind(".png")).toBe("image");
    expect(getMediaMimeType(".md")).toBe("text/markdown");
    expect(
      buildMediaPreview(
        "<html><body>Hello <b>world</b></body></html>",
        ".html",
      ),
    ).toBe("Hello world");
    expect(buildMediaPreview("a,b\n1,2\n3,4", ".csv")).toContain("a,b");
  });

  it("reads audio metadata and related files", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-media-readers-"));
    const audioPath = join(root, "meeting.wav");
    const transcriptPath = join(root, "meeting.transcript.txt");

    try {
      writeFileSync(audioPath, ONE_SECOND_WAV);
      writeFileSync(transcriptPath, "Transcript");

      expect(readMediaAudioMetadata(audioPath, ".wav")?.durationMs).toBe(996);
      expect(listMediaRelatedFiles(audioPath)).toContain(transcriptPath);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
