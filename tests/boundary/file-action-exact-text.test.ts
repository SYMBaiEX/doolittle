import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOOLITTLE_CODING_AGENT_SERVICE } from "@doolittle/contracts";
import type { HandlerOptions, IAgentRuntime, Memory } from "@elizaos/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createFileActions } from "../../packages/agent/src/actions/file-action";
import { WorkspaceService } from "../../packages/agent/src/services/workspace-service";

let root: string;
let runtime: IAgentRuntime;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "doolittle-exact-text-")));
  const workspace = new WorkspaceService(root);
  runtime = {
    getService: (name: string) =>
      name === DOOLITTLE_CODING_AGENT_SERVICE ? workspace : null,
  } as unknown as IAgentRuntime;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function act(name: string, parameters: HandlerOptions["parameters"]) {
  const action = createFileActions().find(
    (candidate) => candidate.name === name,
  );
  if (!action) throw new Error(`Missing action ${name}`);
  return action.handler(runtime, { content: {} } as Memory, undefined, {
    parameters,
  });
}

it.each(["", "\n \t", "hello\n"])(
  "writes exact file content %j",
  async (content) => {
    const result = await act("WRITE_FILE", { path: "new.txt", content });
    expect(result?.success).toBe(true);
    expect(await readFile(join(root, "new.txt"), "utf8")).toBe(content);
  },
);

it("truncates an existing file to empty content", async () => {
  await writeFile(join(root, "existing.txt"), "original");
  const result = await act("WRITE_FILE", { path: "existing.txt", content: "" });
  expect(result?.success).toBe(true);
  expect(await readFile(join(root, "existing.txt"), "utf8")).toBe("");
});

it.each([
  { oldText: "x", newText: " \t", before: "axb", after: "a \tb" },
  { oldText: "\n", newText: " ", before: "a\nb", after: "a b" },
  { oldText: "x", newText: "", before: "axb", after: "ab" },
])("patches exact text $oldText -> $newText", async (entry) => {
  await writeFile(join(root, "patch.txt"), entry.before);
  const result = await act("PATCH_FILE", {
    path: "patch.txt",
    oldText: entry.oldText,
    newText: entry.newText,
  });
  expect(result?.success).toBe(true);
  expect(await readFile(join(root, "patch.txt"), "utf8")).toBe(entry.after);
});

it.each<NonNullable<HandlerOptions["parameters"]>>([
  {},
  { content: null },
  { content: 42 },
  { content: false },
])(
  "rejects missing or non-string content %j without changing the file",
  async (input) => {
    await writeFile(join(root, "existing.txt"), "original");
    const result = await act("WRITE_FILE", { path: "existing.txt", ...input });
    expect(result?.success).toBe(false);
    expect(await readFile(join(root, "existing.txt"), "utf8")).toBe("original");
  },
);

it("rejects empty oldText without changing the file", async () => {
  await writeFile(join(root, "patch.txt"), "original");
  const result = await act("PATCH_FILE", {
    path: "patch.txt",
    oldText: "",
    newText: "replacement",
  });
  expect(result?.success).toBe(false);
  expect(await readFile(join(root, "patch.txt"), "utf8")).toBe("original");
});

it.each<NonNullable<HandlerOptions["parameters"]>>([
  { text: "" },
  { text: " \n" },
  { content: "", text: "ignored" },
  { content: null, text: "fallback" },
])("accepts exact write aliases in key order %j", async (input) => {
  const result = await act("WRITE_FILE", { path: "alias.txt", ...input });
  expect(result?.success).toBe(true);
  expect(await readFile(join(root, "alias.txt"), "utf8")).toBe(
    typeof input.content === "string" ? input.content : input.text,
  );
});

it.each<NonNullable<HandlerOptions["parameters"]>>([
  { old_string: "x", new_string: " \t" },
  { old: "x", new: "" },
  { oldText: "x", old_string: "ignored", newText: "", new_string: "ignored" },
  { oldText: null, old_string: "x", newText: false, new_string: " \t" },
])("accepts exact patch aliases in key order %j", async (input) => {
  await writeFile(join(root, "alias.txt"), "axb");
  const result = await act("PATCH_FILE", { path: "alias.txt", ...input });
  expect(result?.success).toBe(true);
  const replacement =
    "newText" in input && typeof input.newText === "string"
      ? input.newText
      : "new_string" in input
        ? input.new_string
        : input.new;
  expect(await readFile(join(root, "alias.txt"), "utf8")).toBe(
    `a${replacement}b`,
  );
});

it.each<{ input: NonNullable<HandlerOptions["parameters"]>; error: string }>([
  { input: {}, error: "content is required." },
  { input: { text: false }, error: "content must be a string." },
])("reports exact content errors $error", async ({ input, error }) => {
  const result = await act("WRITE_FILE", { path: "alias.txt", ...input });
  expect(result?.success).toBe(false);
  expect(result?.text).toContain(error);
});
