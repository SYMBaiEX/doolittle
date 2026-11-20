import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  type Stats,
} from "node:fs";
import { dirname, isAbsolute, join, win32 } from "node:path";
import {
  RegularFileError,
  readRegularFileSync,
  writeVerifiedFileSync,
} from "@doolittle/storage";
import { resolveWorkspaceServicePath } from "./path";
import { isWorkspacePathVisible } from "./policy";

export const MAX_WORKSPACE_EDITOR_FILE_BYTES = 1_000_000;

export class WorkspaceEditorSaveError extends Error {
  constructor(readonly code: "invalid_file" | "too_large" | "conflict") {
    super(
      code === "conflict"
        ? "File changed after it was opened. Reload it before saving your edits."
        : code === "too_large"
          ? "Workspace file is too large."
          : "Select an existing, regular UTF-8 file in this workspace.",
    );
    this.name = "WorkspaceEditorSaveError";
  }
}

type EditorFileSnapshot = { path: string; stats: Stats };

function assertFileUnchanged(expected: Stats, actual: Stats): void {
  if (
    !actual.isFile() ||
    actual.nlink !== 1 ||
    expected.dev !== actual.dev ||
    expected.ino !== actual.ino ||
    expected.size !== actual.size ||
    expected.mtimeMs !== actual.mtimeMs ||
    expected.ctimeMs !== actual.ctimeMs
  ) {
    throw new WorkspaceEditorSaveError("conflict");
  }
}

export function readWorkspaceEditorSnapshot(
  root: string,
  path: string,
  expectedContent: string,
): EditorFileSnapshot {
  if (
    path.trim() !== path ||
    isAbsolute(path) ||
    win32.isAbsolute(path) ||
    /^[A-Za-z]:/u.test(path) ||
    path.includes("\\") ||
    /[\p{Cc}\p{Cf}]/u.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    !isWorkspacePathVisible(path)
  ) {
    throw new WorkspaceEditorSaveError("invalid_file");
  }
  let resolved: string;
  let stats: Stats;
  let content: string;
  try {
    resolved = resolveWorkspaceServicePath(root, path, "write");
    // Do not bypass the workspace's logical-path policy through an alias.
    if (realpathSync(resolved) !== resolved) {
      throw new WorkspaceEditorSaveError("invalid_file");
    }
    stats = lstatSync(resolved);
    const bytes = readRegularFileSync(
      resolved,
      MAX_WORKSPACE_EDITOR_FILE_BYTES,
      {
        singleLink: true,
      },
    );
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
    if (content.includes("\0"))
      throw new WorkspaceEditorSaveError("invalid_file");
    assertFileUnchanged(stats, lstatSync(resolved));
  } catch (error) {
    if (error instanceof WorkspaceEditorSaveError) throw error;
    if (error instanceof RegularFileError && error.code !== "not_regular") {
      throw new WorkspaceEditorSaveError(
        error.code === "changed" ? "conflict" : "too_large",
      );
    }
    throw new WorkspaceEditorSaveError("invalid_file");
  }
  if (content !== expectedContent)
    throw new WorkspaceEditorSaveError("conflict");
  return { path: resolved, stats };
}

/** Prepare replacement privately and recheck the expected file before rename. */
export function commitWorkspaceEditorSave(
  root: string,
  path: string,
  content: string,
  expectedContent: string,
  previous: EditorFileSnapshot,
): string {
  const current = readWorkspaceEditorSnapshot(root, path, expectedContent);
  assertFileUnchanged(previous.stats, current.stats);
  if (content === expectedContent) return current.path;

  const temporary = mkdtempSync(
    join(dirname(current.path), ".doolittle-save-"),
  );
  const replacement = join(temporary, "file");
  try {
    writeVerifiedFileSync(replacement, Buffer.from(content));
    chmodSync(replacement, current.stats.mode & 0o777);
    const final = readWorkspaceEditorSnapshot(root, path, expectedContent);
    assertFileUnchanged(current.stats, final.stats);
    renameSync(replacement, final.path);
    return final.path;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
