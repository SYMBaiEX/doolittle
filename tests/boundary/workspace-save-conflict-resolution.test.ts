import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  applyFileDraft,
  discardFileEdit,
  rebaseFileEdit,
} from "../../apps/desktop/src/renderer/coding-workspace/file-edits";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { handleOperationsRoutes } from "../../packages/agent/src/server/routes/operations";
import { WorkspaceService } from "../../packages/agent/src/services/workspace-service";

function workspaceSave(
  context: AppContext,
  expectedContent: string,
  content: string,
) {
  const url = new URL("http://localhost/workspace/write");
  return handleOperationsRoutes(
    context,
    new Request(url, {
      method: "POST",
      body: JSON.stringify({ path: "note.txt", expectedContent, content }),
    }),
    url,
  );
}

it("recovers user edits after a save conflict by rebasing onto the disk content", async () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-conflict-resolution-"));
  const path = join(root, "note.txt");
  try {
    writeFileSync(path, "opened version");
    const workspace = new WorkspaceService(root);
    const context = { services: { workspace } } as AppContext;

    // The editor opens the file and the user types without saving.
    let edits = applyFileDraft(
      new Map(),
      "note.txt",
      "opened version",
      "user work",
    );
    expect(edits.get("note.txt")?.baseline).toBe("opened version");

    // The agent (or any external writer) changes the file underneath the editor.
    writeFileSync(path, "agent version");

    // Every save against the pinned baseline conflicts forever: before the
    // resolution flow existed this was a dead-end short of discarding the draft.
    const first = await workspaceSave(context, "opened version", "user work");
    expect(first?.status).toBe(409);
    const retried = await workspaceSave(context, "opened version", "user work");
    expect(retried?.status).toBe(409);
    expect(readFileSync(path, "utf8")).toBe("agent version");

    // Conflict resolution rereads the disk content and rebases the baseline
    // underneath the untouched draft.
    const fresh = workspace.read("note.txt");
    expect(fresh).toBe("agent version");
    const rebased = rebaseFileEdit(edits, "note.txt", fresh);
    expect(rebased.result).toEqual({ kind: "rebased" });
    edits = rebased.next;
    expect(edits.get("note.txt")).toEqual({
      baseline: "agent version",
      content: "user work",
    });

    // The explicit overwrite now compares against what is actually on disk, so
    // the save succeeds and the user's work survives.
    const edit = edits.get("note.txt");
    if (!edit) throw new Error("Expected the draft to survive the rebase.");
    const saved = await workspaceSave(context, edit.baseline, edit.content);
    expect(saved?.status).toBe(200);
    expect(readFileSync(path, "utf8")).toBe("user work");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("drops the edit when the disk version already matches the draft", () => {
  const edits = applyFileDraft(new Map(), "note.txt", "opened", "user work");
  const rebased = rebaseFileEdit(edits, "note.txt", "user work");
  expect(rebased.result).toEqual({ kind: "matches" });
  expect(rebased.next.has("note.txt")).toBe(false);
});

it("keeps unrelated edits and the absent path untouched when rebasing", () => {
  let edits = applyFileDraft(new Map(), "one.txt", "base one", "draft one");
  edits = applyFileDraft(edits, "two.txt", "base two", "draft two");
  const absent = rebaseFileEdit(edits, "missing.txt", "fresh");
  expect(absent.result).toEqual({ kind: "absent" });
  expect(absent.next).toBe(edits);

  const rebased = rebaseFileEdit(edits, "one.txt", "fresh one");
  expect(rebased.next.get("one.txt")).toEqual({
    baseline: "fresh one",
    content: "draft one",
  });
  expect(rebased.next.get("two.txt")).toEqual({
    baseline: "base two",
    content: "draft two",
  });
});

it("drops the draft when it matches the baseline and keeps it otherwise", () => {
  let edits = applyFileDraft(new Map(), "note.txt", "base", "draft");
  expect(edits.get("note.txt")?.content).toBe("draft");
  edits = applyFileDraft(edits, "note.txt", "base", "base");
  expect(edits.has("note.txt")).toBe(false);

  edits = applyFileDraft(new Map(), "note.txt", "base", "draft");
  const discarded = discardFileEdit(edits, "note.txt");
  expect(discarded.has("note.txt")).toBe(false);
  expect(discardFileEdit(discarded, "note.txt")).toBe(discarded);
});
