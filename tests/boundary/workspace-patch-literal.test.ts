import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { WorkspaceService } from "../../packages/agent/src/services/workspace-service";

let root: string;
let workspace: WorkspaceService;

beforeEach(async () => {
  root = await realpath(
    await mkdtemp(join(tmpdir(), "doolittle-literal-patch-")),
  );
  workspace = new WorkspaceService(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it.each(["$$", "$&", "$`", "$'", "$1", "", " \n"])(
  "replaces a unique match with literal text %j",
  async (replacement) => {
    await writeFile(join(root, "file.txt"), "before MATCH after");
    const result = await workspace.patch("file.txt", "MATCH", replacement);
    expect(result.replacements).toBe(1);
    expect(await readFile(join(root, "file.txt"), "utf8")).toBe(
      `before ${replacement} after`,
    );
  },
);

it.each([
  { before: "aaa", oldText: "aa", count: 2 },
  { before: "ababa", oldText: "aba", count: 2 },
  { before: "aaaa", oldText: "aa", count: 3 },
])("rejects overlapping ambiguous matches in $before", async (entry) => {
  await writeFile(join(root, "file.txt"), entry.before);
  await expect(workspace.patch("file.txt", entry.oldText, "x")).rejects.toThrow(
    `oldText matched ${entry.count} times`,
  );
  expect(await readFile(join(root, "file.txt"), "utf8")).toBe(entry.before);
});

it.each([
  { before: "aaa", oldText: "aa", after: "$&a", count: 1 },
  { before: "aaaa", oldText: "aa", after: "$&$&", count: 2 },
])("keeps replaceAll non-overlapping in $before", async (entry) => {
  await writeFile(join(root, "file.txt"), entry.before);
  const result = await workspace.patch("file.txt", entry.oldText, "$&", {
    replaceAll: true,
  });
  expect(result.replacements).toBe(entry.count);
  expect(await readFile(join(root, "file.txt"), "utf8")).toBe(entry.after);
});

it.each([
  { oldText: "", error: "oldText is required" },
  { oldText: "missing", error: "oldText was not found" },
  { oldText: "a", error: "oldText matched 2 times" },
])("rejects invalid patch $oldText without mutation", async (entry) => {
  await writeFile(join(root, "file.txt"), "aba");
  await expect(workspace.patch("file.txt", entry.oldText, "x")).rejects.toThrow(
    entry.error,
  );
  expect(await readFile(join(root, "file.txt"), "utf8")).toBe("aba");
});
