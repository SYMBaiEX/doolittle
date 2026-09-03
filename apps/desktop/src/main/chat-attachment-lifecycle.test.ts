import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { importSelectedAttachments } from "./attachment-import";
import { ChatAttachmentLifecycle } from "./chat-attachment-lifecycle";

const roots: string[] = [];

function setup() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-attachment-lifecycle-"));
  roots.push(root);
  const runtime = join(root, "runtime");
  const source = join(root, "note.txt");
  writeFileSync(source, "draft context");
  const [attachment] = importSelectedAttachments([source], runtime);
  if (!attachment) throw new Error("Expected attachment import.");
  return {
    attachment,
    lifecycle: new ChatAttachmentLifecycle(runtime),
    runtime,
  };
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { force: true, recursive: true });
});

describe("ChatAttachmentLifecycle", () => {
  test("removes both managed files only with the import lease", () => {
    const { attachment, lifecycle, runtime } = setup();
    const capability = lifecycle.lease([attachment]);
    const metadataPath = join(
      runtime,
      "attachments",
      `${attachment.id}.meta.json`,
    );
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
      storedName: string;
    };
    const dataPath = join(runtime, "attachments", metadata.storedName);

    lifecycle.discard([attachment.id], capability);

    expect(existsSync(metadataPath)).toBe(false);
    expect(existsSync(dataPath)).toBe(false);
  });

  test("rejects unauthorized cleanup without deleting the import", () => {
    const { attachment, lifecycle, runtime } = setup();
    lifecycle.lease([attachment]);
    const metadataPath = join(
      runtime,
      "attachments",
      `${attachment.id}.meta.json`,
    );

    expect(() =>
      lifecycle.discard([attachment.id], crypto.randomUUID()),
    ).toThrow(/not authorized/i);
    expect(existsSync(metadataPath)).toBe(true);
  });

  test("keeps the opaque lease across a desktop restart for draft removal", () => {
    const { attachment, lifecycle, runtime } = setup();
    const capability = lifecycle.lease([attachment]);
    const metadataPath = join(
      runtime,
      "attachments",
      `${attachment.id}.meta.json`,
    );

    new ChatAttachmentLifecycle(runtime).discard([attachment.id], capability);

    expect(existsSync(metadataPath)).toBe(false);
    expect(
      existsSync(join(runtime, "attachments", ".leases", `${capability}.json`)),
    ).toBe(false);
  });

  test("preserves a committed attachment for chat history, retry, and fork", () => {
    const { attachment, lifecycle, runtime } = setup();
    const capability = lifecycle.lease([attachment]);
    const metadataPath = join(
      runtime,
      "attachments",
      `${attachment.id}.meta.json`,
    );

    lifecycle.commit([attachment.id], capability);

    expect(existsSync(metadataPath)).toBe(true);
    expect(() => lifecycle.discard([attachment.id], capability)).toThrow(
      /not authorized/i,
    );
  });

  test("never follows tampered metadata outside managed storage", () => {
    const { attachment, lifecycle, runtime } = setup();
    const capability = lifecycle.lease([attachment]);
    const metadataPath = join(
      runtime,
      "attachments",
      `${attachment.id}.meta.json`,
    );
    const outside = join(runtime, "outside.txt");
    writeFileSync(outside, "keep");
    writeFileSync(
      metadataPath,
      JSON.stringify({ id: attachment.id, storedName: "../outside.txt" }),
    );

    expect(() => lifecycle.discard([attachment.id], capability)).toThrow(
      /metadata/i,
    );
    expect(readFileSync(outside, "utf8")).toBe("keep");
  });
});
