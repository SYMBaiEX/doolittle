import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { handleChatSubmitRoute } from "../../packages/agent/src/server/routes/conversation/chat";
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  resolveManagedAttachmentPath,
  resolveManagedChatAttachments,
} from "../../packages/agent/src/services/chat-attachments";

const readHook = vi.hoisted(() => ({
  path: "",
  handle: undefined as FileHandle | undefined,
  beforeOpen: undefined as (() => void) | undefined,
  afterRead: undefined as (() => void) | undefined,
}));

vi.mock(import("node:fs/promises"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    async open(...args: Parameters<typeof original.open>) {
      if (readHook.path !== args[0]) return original.open(...args);

      readHook.beforeOpen?.();
      const handle = await original.open(...args);
      readHook.handle = handle;
      const originalRead = handle.read;
      return Object.assign(handle, {
        async read(...parameters: unknown[]) {
          const result = await Reflect.apply(originalRead, handle, parameters);
          readHook.afterRead?.();
          return result;
        },
      });
    },
  };
});

let dataDir: string;

beforeEach(() => {
  dataDir = realpathSync(mkdtempSync(join(tmpdir(), "doolittle-attachments-")));
  mkdirSync(join(dataDir, "attachments"));
});

afterEach(() => {
  readHook.path = "";
  readHook.handle = undefined;
  readHook.beforeOpen = undefined;
  readHook.afterRead = undefined;
  rmSync(dataDir, { recursive: true, force: true });
});

function fixture(bytes: Buffer, sizeBytes = bytes.byteLength) {
  const id = randomUUID();
  const storedName = `${id}.txt`;
  const path = join(dataDir, "attachments", storedName);
  const sidecar = join(dataDir, "attachments", `${id}.meta.json`);
  const metadata = {
    id,
    name: "notes.txt",
    kind: "document",
    mimeType: "text/plain",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes,
  };
  writeFileSync(
    sidecar,
    JSON.stringify({ ...metadata, version: 1, storedName }),
  );
  if (sizeBytes === bytes.byteLength) writeFileSync(path, bytes);
  return { id, path, metadata, sidecar };
}

it("keeps attachment order and bytes while resolving the canonical path", async () => {
  const first = fixture(Buffer.from("First attachment"));
  const second = fixture(Buffer.from("Second attachment — 漢字"));
  const attachments = await resolveManagedChatAttachments({
    dataDir,
    attachmentIds: [second.id, first.id],
  });
  expect(attachments.map(({ descriptor }) => descriptor)).toEqual([
    second.metadata,
    first.metadata,
  ]);
  expect(attachments[0].media.text).toBe("Second attachment — 漢字");
  expect(
    Buffer.from(attachments[0].media._data, "base64").toString("utf8"),
  ).toBe("Second attachment — 漢字");
  await expect(
    resolveManagedAttachmentPath({ dataDir, attachmentId: second.id }),
  ).resolves.toEqual({ descriptor: second.metadata, path: second.path });
});

it("rejects an over-budget set from metadata before any payload read", async () => {
  const attachmentIds = Array.from(
    { length: 3 },
    () => fixture(Buffer.alloc(0), MAX_CHAT_ATTACHMENT_BYTES).id,
  );
  // Missing payloads would yield not_found if the service attempted to open one.
  await expect(
    resolveManagedChatAttachments({ dataDir, attachmentIds }),
  ).rejects.toMatchObject({ code: "limit_exceeded" });
});

it.each([8, 2 * 1024 * 1024])(
  "validates integrity for a %i byte payload",
  async (size) => {
    const { id, metadata, path } = fixture(Buffer.alloc(size, 0x4f));
    const attachment = { dataDir, attachmentId: id };
    await expect(resolveManagedAttachmentPath(attachment)).resolves.toEqual({
      descriptor: metadata,
      path,
    });
    writeFileSync(path, Buffer.alloc(size, 0x5f));
    await expect(
      resolveManagedChatAttachments({ dataDir, attachmentIds: [id] }),
    ).rejects.toMatchObject({ code: "integrity_failed" });
  },
);

it("rejects paths that resolve outside the managed attachment directory", async () => {
  const { id, path } = fixture(Buffer.from("outside"));
  const outside = join(dataDir, "outside.txt");
  writeFileSync(outside, "outside");
  unlinkSync(path);
  symlinkSync(outside, path);
  await expect(
    resolveManagedAttachmentPath({ dataDir, attachmentId: id }),
  ).rejects.toMatchObject({ code: "invalid_metadata" });
});

it("rejects a replaced inode even when its payload bytes still match", async () => {
  const bytes = Buffer.from("unchanged content");
  const { id, path } = fixture(bytes);
  const replacement = join(dataDir, "replacement.txt");
  writeFileSync(replacement, bytes);
  readHook.path = path;
  readHook.beforeOpen = () => renameSync(replacement, path);
  await expect(
    resolveManagedAttachmentPath({ dataDir, attachmentId: id }),
  ).rejects.toMatchObject({ code: "integrity_failed" });
  expect(readHook.handle?.fd).toBe(-1);
});

it("closes a cancelled attachment read before admitting the chat run", async () => {
  const { id, path } = fixture(Buffer.alloc(2 * 1024 * 1024, 0x4f));
  const controller = new AbortController();
  const cancellation = new Error("Chat request disconnected");
  const claimTaskRun = vi.fn();
  const context = {
    config: { dataDir },
    services: { runController: { claimTaskRun } },
  } as unknown as AppContext;
  const request = new Request("http://localhost/chat/runs", {
    method: "POST",
    body: JSON.stringify({
      message: "Read this attachment",
      attachmentIds: [id],
    }),
    signal: controller.signal,
  });
  readHook.path = path;
  readHook.afterRead = vi.fn(() => controller.abort(cancellation));
  await expect(handleChatSubmitRoute(context, request)).rejects.toBe(
    cancellation,
  );
  expect(readHook.afterRead).toHaveBeenCalledOnce();
  expect(readHook.handle?.fd).toBe(-1);
  expect(claimTaskRun).not.toHaveBeenCalled();
});
