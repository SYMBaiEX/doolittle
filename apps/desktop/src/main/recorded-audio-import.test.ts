import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  importRecordedAudio,
  RECORDED_AUDIO_IMPORT_MAX_BYTES,
} from "./recorded-audio-import";

const roots: string[] = [];

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "doolittle-recorded-audio-"));
  roots.push(root);
  return root;
}

function wavBytes(): Buffer {
  return Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.alloc(4),
    Buffer.from("WAVEfmt "),
    Buffer.alloc(24),
  ]);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("importRecordedAudio", () => {
  test("atomically imports ArrayBuffer audio into private managed storage", () => {
    const root = sandbox();
    const contents = wavBytes();
    const arrayBuffer = contents.buffer.slice(
      contents.byteOffset,
      contents.byteOffset + contents.byteLength,
    ) as ArrayBuffer;

    const descriptor = importRecordedAudio(
      {
        bytes: arrayBuffer,
        mimeType: "audio/wav",
        name: "Voice note.wav",
      },
      join(root, "runtime"),
    );

    expect(descriptor).toMatchObject({
      name: "Voice note.wav",
      kind: "audio",
      mimeType: "audio/wav",
      sizeBytes: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
    const attachmentsDir = join(root, "runtime", "attachments");
    const metadataPath = join(attachmentsDir, `${descriptor.id}.meta.json`);
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
      storedName: string;
    };
    expect(readFileSync(join(attachmentsDir, metadata.storedName))).toEqual(
      contents,
    );
    expect(JSON.stringify(descriptor)).not.toContain(root);
    expect(
      readdirSync(attachmentsDir).some((name) => name.startsWith(".")),
    ).toBe(false);
    if (process.platform !== "win32") {
      expect(lstatSync(attachmentsDir).mode & 0o777).toBe(0o700);
      expect(lstatSync(metadataPath).mode & 0o777).toBe(0o600);
      expect(
        lstatSync(join(attachmentsDir, metadata.storedName)).mode & 0o777,
      ).toBe(0o600);
    }
  });

  test("rejects paths, unsupported or mismatched MIME types, and oversized bytes", () => {
    const root = sandbox();
    const runtime = join(root, "runtime");

    expect(() =>
      importRecordedAudio(
        {
          bytes: "/tmp/recording.wav" as unknown as Uint8Array,
          mimeType: "audio/wav",
          name: "recording.wav",
        },
        runtime,
      ),
    ).toThrow(expect.objectContaining({ code: "invalid_audio" }));
    expect(() =>
      importRecordedAudio(
        {
          bytes: wavBytes(),
          mimeType: "audio/flac",
          name: "recording.flac",
        },
        runtime,
      ),
    ).toThrow(expect.objectContaining({ code: "unsupported_audio" }));
    expect(() =>
      importRecordedAudio(
        {
          bytes: wavBytes(),
          mimeType: "audio/ogg",
          name: "recording.ogg",
        },
        runtime,
      ),
    ).toThrow(expect.objectContaining({ code: "invalid_audio" }));
    expect(() =>
      importRecordedAudio(
        {
          bytes: Buffer.alloc(RECORDED_AUDIO_IMPORT_MAX_BYTES + 1, 0),
          mimeType: "audio/wav",
          name: "recording.wav",
        },
        runtime,
      ),
    ).toThrow(expect.objectContaining({ code: "audio_too_large" }));
  });

  test("removes the managed data file and temporary files after a late failure", () => {
    const root = sandbox();
    const runtime = join(root, "runtime");
    vi.spyOn(Date.prototype, "toISOString").mockImplementationOnce(() => {
      throw new Error("simulated metadata failure");
    });

    expect(() =>
      importRecordedAudio(
        {
          bytes: wavBytes(),
          mimeType: "audio/wav",
          name: "recording.wav",
        },
        runtime,
      ),
    ).toThrow(expect.objectContaining({ code: "import_failed" }));

    expect(readdirSync(join(runtime, "attachments"))).toEqual([]);
  });
});
