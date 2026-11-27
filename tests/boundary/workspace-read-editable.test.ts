import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { handleWorkspaceRoutes } from "../../packages/agent/src/server/routes/workspace";
import { WorkspaceService } from "../../packages/agent/src/services/workspace-service";
import { MAX_EDITABLE_FILE_BYTES } from "../../packages/agent/src/services/workspace-service/file-operations";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-read-editable-"));
  const workspace = new WorkspaceService(root);
  const context = { services: { workspace } } as AppContext;
  const read = async (path: string) => {
    const url = new URL(
      `http://localhost/workspace/read?path=${encodeURIComponent(path)}`,
    );
    const response = await handleWorkspaceRoutes(
      context,
      new Request(url),
      url,
    );
    if (!response) throw new Error("The read route did not respond.");
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  };
  return { root, read };
}

it("reports binary files honestly instead of returning lossy text", async () => {
  const { root, read } = setup();
  try {
    writeFileSync(
      join(root, "image.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]),
    );
    const binary = await read("image.png");
    expect(binary.status).toBe(200);
    expect(binary.body.binary).toBe(true);
    expect(binary.body.content).toBeUndefined();

    // Invalid UTF-8 without NUL bytes (a UTF-16LE BOM) is not editable text either:
    // the re-encoded buffer could never byte-match for the conditional write.
    writeFileSync(
      join(root, "legacy.txt"),
      Buffer.from([0xff, 0xfe, 0x68, 0x00]),
    );
    const lossy = await read("legacy.txt");
    expect(lossy.body.binary).toBe(true);
    expect(lossy.body.content).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("refuses files over the editing limit with their real size", async () => {
  const { root, read } = setup();
  try {
    writeFileSync(
      join(root, "huge.log"),
      "x".repeat(MAX_EDITABLE_FILE_BYTES + 1),
    );
    const oversized = await read("huge.log");
    expect(oversized.status).toBe(200);
    expect(oversized.body.tooLarge).toBe(true);
    expect(oversized.body.sizeBytes).toBe(MAX_EDITABLE_FILE_BYTES + 1);
    expect(oversized.body.limitBytes).toBe(MAX_EDITABLE_FILE_BYTES);
    expect(oversized.body.content).toBeUndefined();

    writeFileSync(
      join(root, "capped.log"),
      "x".repeat(MAX_EDITABLE_FILE_BYTES),
    );
    const atCap = await read("capped.log");
    expect(atCap.body.tooLarge).toBeUndefined();
    expect((atCap.body.content as string).length).toBe(MAX_EDITABLE_FILE_BYTES);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("round-trips utf8 text with a byte-order mark byte-for-byte", async () => {
  const { root, read } = setup();
  try {
    const original = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("export const café = 1;\n", "utf8"),
    ]);
    writeFileSync(join(root, "bom.ts"), original);
    const result = await read("bom.ts");
    expect(result.body.binary).toBeUndefined();
    const content = result.body.content as string;
    expect(typeof content).toBe("string");
    // The conditional-write compare-and-swap re-encodes this exact string.
    expect(Buffer.from(content, "utf8").equals(original)).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("still reads symlinked files that resolve inside the workspace", async () => {
  const { root, read } = setup();
  try {
    writeFileSync(join(root, "target.txt"), "linked content");
    symlinkSync(join(root, "target.txt"), join(root, "link.txt"));
    const result = await read("link.txt");
    expect(result.status).toBe(200);
    expect(result.body.content).toBe("linked content");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
