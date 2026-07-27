import { afterEach, describe, expect, it } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENTS_TOTAL_BYTES,
  ManagedAttachmentError,
  resolveManagedChatAttachments,
} from "./chat-attachments";

const createdDirectories: string[] = [];

function createDataDir(): string {
  const dataDir = mkdtempSync(join(tmpdir(), "doolittle-chat-attachments-"));
  createdDirectories.push(dataDir);
  mkdirSync(join(dataDir, "attachments"), { recursive: true });
  return dataDir;
}

function writeManagedAttachment(
  dataDir: string,
  overrides: Partial<{
    id: string;
    name: string;
    kind: "image" | "video" | "audio" | "document";
    mimeType: string;
    content: Buffer;
    sha256: string;
    sizeBytes: number;
    storedName: string;
  }> = {},
): string {
  const id = overrides.id ?? randomUUID();
  const content = overrides.content ?? Buffer.from("hello attachment");
  const storedName = overrides.storedName ?? `${id}.txt`;
  writeFileSync(join(dataDir, "attachments", storedName), content, {
    mode: 0o600,
  });
  writeFileSync(
    join(dataDir, "attachments", `${id}.meta.json`),
    JSON.stringify({
      version: 1,
      id,
      name: overrides.name ?? "notes.txt",
      kind: overrides.kind ?? "document",
      mimeType: overrides.mimeType ?? "text/plain",
      sizeBytes: overrides.sizeBytes ?? content.byteLength,
      sha256:
        overrides.sha256 ?? createHash("sha256").update(content).digest("hex"),
      storedName,
      createdAt: new Date(0).toISOString(),
    }),
    { mode: 0o600 },
  );
  return id;
}

afterEach(() => {
  while (createdDirectories.length) {
    const directory = createdDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("resolveManagedChatAttachments", () => {
  it("returns safe descriptors and Eliza-compatible Media values", async () => {
    const dataDir = createDataDir();
    const id = writeManagedAttachment(dataDir, {
      name: "operator notes.txt",
    });

    const [resolved] = await resolveManagedChatAttachments({
      dataDir,
      attachmentIds: [id],
    });

    expect(resolved).toEqual({
      descriptor: {
        id,
        name: "operator notes.txt",
        kind: "document",
        mimeType: "text/plain",
        sizeBytes: 16,
        sha256: createHash("sha256")
          .update(Buffer.from("hello attachment"))
          .digest("hex"),
      },
      media: {
        id,
        url: `attachment://${id}`,
        title: "operator notes.txt",
        source: "desktop",
        contentType: "document",
        text: "hello attachment",
        _data: Buffer.from("hello attachment").toString("base64"),
        _mimeType: "text/plain",
      },
    });
    expect(JSON.stringify(resolved)).not.toContain(dataDir);
  });

  it("rejects invalid, uppercase, duplicate, and excessive ID requests", async () => {
    const dataDir = createDataDir();
    const id = writeManagedAttachment(dataDir);

    await expect(
      resolveManagedChatAttachments({
        dataDir,
        attachmentIds: ["../../private-key"],
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      resolveManagedChatAttachments({
        dataDir,
        attachmentIds: [id.toUpperCase()],
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      resolveManagedChatAttachments({ dataDir, attachmentIds: [id, id] }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      resolveManagedChatAttachments({
        dataDir,
        attachmentIds: Array.from({ length: MAX_CHAT_ATTACHMENTS + 1 }, () =>
          randomUUID(),
        ),
      }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });
  });

  it("rejects malformed sidecars without disclosing managed paths", async () => {
    const dataDir = createDataDir();
    const id = randomUUID();
    writeFileSync(
      join(dataDir, "attachments", `${id}.meta.json`),
      "{ definitely not json",
    );

    let error: unknown;
    try {
      await resolveManagedChatAttachments({
        dataDir,
        attachmentIds: [id],
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ManagedAttachmentError);
    expect(error).toMatchObject({ code: "invalid_metadata" });
    expect(String(error)).not.toContain(dataDir);
  });

  it("rejects files whose size or digest no longer matches the sidecar", async () => {
    const dataDir = createDataDir();
    const sizeId = writeManagedAttachment(dataDir, { sizeBytes: 999 });
    const digestId = writeManagedAttachment(dataDir, {
      sha256: "0".repeat(64),
    });

    await expect(
      resolveManagedChatAttachments({
        dataDir,
        attachmentIds: [sizeId],
      }),
    ).rejects.toMatchObject({ code: "integrity_failed" });
    await expect(
      resolveManagedChatAttachments({
        dataDir,
        attachmentIds: [digestId],
      }),
    ).rejects.toMatchObject({ code: "integrity_failed" });
  });

  it("prevents non-text media from falling back to local URL fetching", async () => {
    const dataDir = createDataDir();
    const imageId = randomUUID();
    const audioId = randomUUID();
    writeManagedAttachment(dataDir, {
      id: imageId,
      name: "mock.png",
      kind: "image",
      mimeType: "image/png",
      storedName: `${imageId}.png`,
    });
    writeManagedAttachment(dataDir, {
      id: audioId,
      name: "voice.wav",
      kind: "audio",
      mimeType: "audio/wav",
      storedName: `${audioId}.wav`,
    });

    const [image, audio] = await resolveManagedChatAttachments({
      dataDir,
      attachmentIds: [imageId, audioId],
    });

    expect(image?.media.text).toBeUndefined();
    expect(image?.media._data).toBe(
      Buffer.from("hello attachment").toString("base64"),
    );
    expect(audio?.media.text).toBe("[Attached audio: voice.wav (audio/wav)]");
    expect(audio?.media.url).toBe(`attachment://${audioId}`);
  });

  it("enforces the aggregate byte limit across individually valid files", async () => {
    const dataDir = createDataDir();
    const bytesPerFile = Math.min(
      MAX_CHAT_ATTACHMENT_BYTES,
      Math.floor(MAX_CHAT_ATTACHMENTS_TOTAL_BYTES / 3) + 1,
    );
    const ids = Array.from({ length: 3 }, (_, index) =>
      writeManagedAttachment(dataDir, {
        content: Buffer.alloc(bytesPerFile, index),
      }),
    );

    await expect(
      resolveManagedChatAttachments({ dataDir, attachmentIds: ids }),
    ).rejects.toMatchObject({ code: "limit_exceeded" });
  });

  it("rejects unsafe display names and stored filenames in metadata", async () => {
    const dataDir = createDataDir();
    const unsafeNameId = writeManagedAttachment(dataDir, {
      name: "..\\private.txt",
    });
    const unsafeStoredNameId = randomUUID();
    writeFileSync(
      join(dataDir, "attachments", `${unsafeStoredNameId}.meta.json`),
      JSON.stringify({
        version: 1,
        id: unsafeStoredNameId,
        name: "notes.txt",
        kind: "document",
        mimeType: "text/plain",
        sizeBytes: 0,
        sha256: createHash("sha256").digest("hex"),
        storedName: `..\\${unsafeStoredNameId}.txt`,
      }),
    );

    await expect(
      resolveManagedChatAttachments({
        dataDir,
        attachmentIds: [unsafeNameId],
      }),
    ).rejects.toMatchObject({ code: "invalid_metadata" });
    await expect(
      resolveManagedChatAttachments({
        dataDir,
        attachmentIds: [unsafeStoredNameId],
      }),
    ).rejects.toMatchObject({ code: "invalid_metadata" });
  });

  it("rejects sidecars and files that escape the canonical attachments root", async () => {
    const dataDir = createDataDir();
    const outsideDir = mkdtempSync(join(tmpdir(), "doolittle-outside-"));
    createdDirectories.push(outsideDir);

    const sidecarId = randomUUID();
    const outsideSidecar = join(outsideDir, `${sidecarId}.json`);
    writeFileSync(outsideSidecar, "{}");
    symlinkSync(
      outsideSidecar,
      join(dataDir, "attachments", `${sidecarId}.meta.json`),
    );

    await expect(
      resolveManagedChatAttachments({
        dataDir,
        attachmentIds: [sidecarId],
      }),
    ).rejects.toMatchObject({ code: "invalid_metadata" });

    const fileId = randomUUID();
    const outsideFile = join(outsideDir, `${fileId}.txt`);
    const content = Buffer.from("outside");
    writeFileSync(outsideFile, content);
    symlinkSync(outsideFile, join(dataDir, "attachments", `${fileId}.txt`));
    writeFileSync(
      join(dataDir, "attachments", `${fileId}.meta.json`),
      JSON.stringify({
        version: 1,
        id: fileId,
        name: "outside.txt",
        kind: "document",
        mimeType: "text/plain",
        sizeBytes: content.byteLength,
        sha256: createHash("sha256").update(content).digest("hex"),
        storedName: `${fileId}.txt`,
      }),
    );

    await expect(
      resolveManagedChatAttachments({
        dataDir,
        attachmentIds: [fileId],
      }),
    ).rejects.toMatchObject({ code: "invalid_metadata" });
  });

  it("rejects a symlinked attachment store outside dataDir", async () => {
    const dataDir = createDataDir();
    const outsideDir = mkdtempSync(join(tmpdir(), "doolittle-store-outside-"));
    createdDirectories.push(outsideDir);
    rmSync(join(dataDir, "attachments"), { recursive: true });
    symlinkSync(outsideDir, join(dataDir, "attachments"));

    await expect(
      resolveManagedChatAttachments({
        dataDir,
        attachmentIds: [randomUUID()],
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});
