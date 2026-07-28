import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  ATTACHMENT_IMPORT_LIMITS,
  AttachmentImportError,
  importSelectedAttachments,
  type ManagedAttachmentMetadata,
} from "./attachment-import";

const roots: string[] = [];

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "doolittle-attachment-import-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("importSelectedAttachments", () => {
  test("copies into private managed storage and exposes no local path", () => {
    const root = sandbox();
    const source = join(root, "operator notes.md");
    const contents = Buffer.from("# Review\n\nNo secrets in the descriptor.\n");
    writeFileSync(source, contents);

    const [descriptor] = importSelectedAttachments(
      [source],
      join(root, "runtime"),
    );

    expect(descriptor).toMatchObject({
      name: "operator notes.md",
      kind: "document",
      mimeType: "text/markdown",
      sizeBytes: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
    expect(descriptor?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(Object.keys(descriptor ?? {}).sort()).toEqual([
      "id",
      "kind",
      "mimeType",
      "name",
      "sha256",
      "sizeBytes",
    ]);

    const attachmentsDir = join(root, "runtime", "attachments");
    const metadataPath = join(attachmentsDir, `${descriptor?.id}.meta.json`);
    const metadata = JSON.parse(
      readFileSync(metadataPath, "utf8"),
    ) as ManagedAttachmentMetadata;
    expect(metadata).toMatchObject(descriptor ?? {});
    expect(metadata.version).toBe(1);
    expect(metadata.storedName).toBe(`${descriptor?.id}.md`);
    expect(JSON.stringify(metadata)).not.toContain(root);
    expect(readFileSync(join(attachmentsDir, metadata.storedName))).toEqual(
      contents,
    );

    if (process.platform !== "win32") {
      expect(lstatSync(attachmentsDir).mode & 0o777).toBe(0o700);
      expect(lstatSync(metadataPath).mode & 0o777).toBe(0o600);
      expect(
        lstatSync(join(attachmentsDir, metadata.storedName)).mode & 0o777,
      ).toBe(0o600);
    }
  });

  test("uses magic bytes instead of a misleading extension", () => {
    const root = sandbox();
    const source = join(root, "definitely-text.txt");
    writeFileSync(
      source,
      Buffer.from("%PDF-1.7\nnot a complete PDF but valid magic\n"),
    );

    const [descriptor] = importSelectedAttachments(
      [source],
      join(root, "runtime"),
    );

    expect(descriptor?.mimeType).toBe("application/pdf");
    expect(descriptor?.kind).toBe("document");
    expect(
      readdirSync(join(root, "runtime", "attachments")).some((entry) =>
        entry.endsWith(".pdf"),
      ),
    ).toBe(true);
  });

  test("keeps JSON content distinct from its metadata sidecar", () => {
    const root = sandbox();
    const source = join(root, "payload.json");
    writeFileSync(source, '{"ready":true}\n');

    const [descriptor] = importSelectedAttachments(
      [source],
      join(root, "runtime"),
    );
    const attachmentsDir = join(root, "runtime", "attachments");
    const entries = readdirSync(attachmentsDir).sort();

    expect(entries).toEqual([
      `${descriptor?.id}.json`,
      `${descriptor?.id}.meta.json`,
    ]);
    expect(
      readFileSync(join(attachmentsDir, `${descriptor?.id}.json`), "utf8"),
    ).toBe('{"ready":true}\n');
  });

  test("canonicalizes a selected symlink while retaining a safe display name", () => {
    const root = sandbox();
    const target = join(root, "target.txt");
    const selected = join(root, "selected.txt");
    writeFileSync(target, "hello");
    symlinkSync(target, selected);

    const [descriptor] = importSelectedAttachments(
      [selected],
      join(root, "runtime"),
    );

    expect(descriptor?.name).toBe("selected.txt");
    expect(descriptor?.sha256).toBe(
      createHash("sha256").update("hello").digest("hex"),
    );
  });

  test("rejects directories and unknown binary content without creating storage", () => {
    const root = sandbox();
    const runtime = join(root, "runtime");
    const unknown = join(root, "payload.bin");
    writeFileSync(unknown, Buffer.from([0x00, 0x01, 0x02, 0x03]));

    expect(() => importSelectedAttachments([root], runtime)).toThrow(
      AttachmentImportError,
    );
    expect(() => importSelectedAttachments([unknown], runtime)).toThrow(
      expect.objectContaining({ code: "unsupported_file" }),
    );
    expect(() => readdirSync(runtime)).toThrow();
  });

  test("enforces count, name, per-file, and combined limits before copying", () => {
    const root = sandbox();
    const runtime = join(root, "runtime");
    const small = join(root, "small.txt");
    writeFileSync(small, "ok");

    expect(() => importSelectedAttachments([], runtime)).toThrow(
      expect.objectContaining({ code: "invalid_selection" }),
    );
    expect(() =>
      importSelectedAttachments(
        Array.from(
          { length: ATTACHMENT_IMPORT_LIMITS.maxCount + 1 },
          () => small,
        ),
        runtime,
      ),
    ).toThrow(expect.objectContaining({ code: "invalid_selection" }));

    const longName = `${"é".repeat(ATTACHMENT_IMPORT_LIMITS.maxNameBytes / 2)}.txt`;
    const longNamePath = join(root, longName);
    writeFileSync(longNamePath, "too long");
    expect(() => importSelectedAttachments([longNamePath], runtime)).toThrow(
      expect.objectContaining({ code: "invalid_name" }),
    );

    const tooLarge = join(root, "too-large.txt");
    writeFileSync(tooLarge, "x");
    truncateSync(tooLarge, ATTACHMENT_IMPORT_LIMITS.maxFileBytes + 1);
    expect(() => importSelectedAttachments([tooLarge], runtime)).toThrow(
      expect.objectContaining({ code: "file_too_large" }),
    );

    const combined = [
      join(root, "one.txt"),
      join(root, "two.txt"),
      join(root, "three.txt"),
    ];
    const combinedFileSize =
      Math.floor(ATTACHMENT_IMPORT_LIMITS.maxTotalBytes / 3) + 1;
    for (const path of combined) {
      writeFileSync(path, Buffer.alloc(combinedFileSize, 0x78));
    }
    expect(() => importSelectedAttachments(combined, runtime)).toThrow(
      expect.objectContaining({ code: "selection_too_large" }),
    );
    expect(() => readdirSync(runtime)).toThrow();
  });

  test("does not leave a partial batch when a later input is invalid", () => {
    const root = sandbox();
    const runtime = join(root, "runtime");
    const valid = join(root, "valid.txt");
    const invalid = join(root, "invalid.bin");
    writeFileSync(valid, "valid");
    writeFileSync(invalid, Buffer.from([0x00, 0xff]));

    expect(() => importSelectedAttachments([valid, invalid], runtime)).toThrow(
      expect.objectContaining({ code: "unsupported_file" }),
    );
    expect(() => readdirSync(runtime)).toThrow();
  });

  test("repairs managed directory permissions before import", () => {
    if (process.platform === "win32") return;
    const root = sandbox();
    const runtime = join(root, "runtime");
    const attachments = join(runtime, "attachments");
    const source = join(root, "note.txt");
    writeFileSync(source, "hello");
    importSelectedAttachments([source], runtime);
    chmodSync(attachments, 0o755);

    importSelectedAttachments([source], runtime);

    expect(lstatSync(attachments).mode & 0o777).toBe(0o700);
  });
});
