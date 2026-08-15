import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  importRecordedAudio,
  pruneStaleRecordedAudioImports,
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
  test("atomically imports ArrayBuffer audio into private transient storage", () => {
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
    const sessionDir = join(
      root,
      "runtime",
      "transient",
      "dictation",
      descriptor.id,
    );
    const metadataPath = join(sessionDir, `${descriptor.id}.meta.json`);
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
      storedName: string;
    };
    expect(readFileSync(join(sessionDir, metadata.storedName))).toEqual(
      contents,
    );
    expect(JSON.stringify(descriptor)).not.toContain(root);
    expect(readdirSync(sessionDir).some((name) => name.startsWith("."))).toBe(
      false,
    );
    if (process.platform !== "win32") {
      expect(lstatSync(sessionDir).mode & 0o777).toBe(0o700);
      expect(lstatSync(metadataPath).mode & 0o777).toBe(0o600);
      expect(
        lstatSync(join(sessionDir, metadata.storedName)).mode & 0o777,
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

  test("removes transient data and temporary files after a late failure", () => {
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

    expect(readdirSync(join(runtime, "transient", "dictation"))).toEqual([]);
  });

  test("prunes crash-left dictation imports without touching durable attachments", () => {
    const root = sandbox();
    const runtime = join(root, "runtime");
    const descriptor = importRecordedAudio(
      {
        bytes: wavBytes(),
        mimeType: "audio/wav",
        name: "recording.wav",
      },
      runtime,
    );
    const durableDir = join(runtime, "attachments");
    const durablePath = join(durableDir, "keep.txt");
    mkdirSync(durableDir, { recursive: true });
    writeFileSync(durablePath, "durable");

    expect(pruneStaleRecordedAudioImports(runtime)).toBe(1);
    expect(
      existsSync(join(runtime, "transient", "dictation", descriptor.id)),
    ).toBe(false);
    expect(readFileSync(durablePath, "utf8")).toBe("durable");
  });

  test("bounds startup pruning work", () => {
    const root = sandbox();
    const runtime = join(root, "runtime");
    for (let index = 0; index < 3; index += 1) {
      importRecordedAudio(
        {
          bytes: wavBytes(),
          mimeType: "audio/wav",
          name: `recording-${index}.wav`,
        },
        runtime,
      );
    }

    expect(pruneStaleRecordedAudioImports(runtime, 1)).toBe(1);
    expect(readdirSync(join(runtime, "transient", "dictation"))).toHaveLength(
      2,
    );
  });

  test.skipIf(process.platform === "win32")(
    "rejects a symlinked transient root before creating external files",
    () => {
      const root = sandbox();
      const runtime = join(root, "runtime");
      const externalDir = join(root, "external");
      mkdirSync(runtime);
      mkdirSync(externalDir);
      symlinkSync(externalDir, join(runtime, "transient"), "dir");

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
      expect(readdirSync(externalDir)).toEqual([]);
    },
  );

  test.skipIf(process.platform === "win32")(
    "unlinks a stale symlink without traversing its external target",
    () => {
      const root = sandbox();
      const runtime = join(root, "runtime");
      const importsDir = join(runtime, "transient", "dictation");
      const externalDir = join(root, "external");
      const externalFile = join(externalDir, "keep.txt");
      mkdirSync(importsDir, { recursive: true });
      mkdirSync(externalDir);
      writeFileSync(externalFile, "keep");
      const linkName = "00000000-0000-4000-8000-000000000001";
      symlinkSync(externalDir, join(importsDir, linkName), "dir");

      expect(pruneStaleRecordedAudioImports(runtime)).toBe(1);
      expect(readFileSync(externalFile, "utf8")).toBe("keep");
      expect(existsSync(join(importsDir, linkName))).toBe(false);
    },
  );
});
