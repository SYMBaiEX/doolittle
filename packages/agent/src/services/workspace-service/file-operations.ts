import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type {
  WorkspaceReadLinesResult as ContractWorkspaceReadLinesResult,
  WorkspaceDirectoryResult,
  WorkspaceFileSearchInput,
  WorkspaceFileSearchMatch,
  WorkspaceFileSearchResult,
  WorkspacePatchResult,
  WorkspaceWriteResult,
} from "@doolittle/contracts";
import {
  RegularFileError,
  readRegularFileDescriptorSync,
  readRegularFileSync,
} from "@doolittle/storage";
import { resolveWorkspaceServicePath } from "./path";
import { workspaceRelativePath } from "./path-format";
import { isWorkspacePathVisible } from "./policy";

const DEFAULT_READ_LIMIT = 500;
const MAX_READ_LIMIT = 2_000;
const MAX_SEARCH_RESULTS = 100;
const MAX_SEARCH_FILE_BYTES = 1_000_000;
// Editor reads must round-trip byte-for-byte through the conditional write and
// stay small enough to serialize to the desktop without stalling the runtime.
export const MAX_EDITABLE_FILE_BYTES = 1_000_000;

export interface WorkspacePatchPlan {
  path: string;
  content: string;
  replacements: number;
}

interface WorkspaceWriteExpectation {
  target: string;
  bytes: Buffer;
  existed: boolean;
  recreateMissing: boolean;
}

export class WorkspaceWriteConflictError extends Error {
  constructor() {
    super(
      "File changed after it was opened. Reload it before saving your edits.",
    );
    this.name = "WorkspaceWriteConflictError";
  }
}

function asWorkspaceWriteTargetError(error: unknown): unknown {
  const code = (error as NodeJS.ErrnoException).code;
  if (
    error instanceof RegularFileError ||
    code === "ENOENT" ||
    code === "ENOTDIR" ||
    code === "ELOOP" ||
    code === "EEXIST"
  ) {
    return new WorkspaceWriteConflictError();
  }
  return error;
}

function checkWorkspaceWriteTarget<T>(check: () => T): T {
  try {
    return check();
  } catch (error) {
    throw asWorkspaceWriteTargetError(error);
  }
}

export function captureWorkspaceWriteExpectation(
  resolvedPath: string,
  expectedContent: string,
  options: { recreateMissing?: boolean } = {},
): WorkspaceWriteExpectation {
  const bytes = Buffer.from(expectedContent, "utf8");
  try {
    const target = realpathSync(resolvedPath);
    if (!readRegularFileSync(target, bytes.byteLength).equals(bytes)) {
      throw new WorkspaceWriteConflictError();
    }
    return {
      target,
      bytes,
      existed: true,
      recreateMissing: options.recreateMissing === true,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (options.recreateMissing === true && code === "ENOENT") {
      return {
        target: resolvedPath,
        bytes,
        existed: false,
        recreateMissing: true,
      };
    }
    throw asWorkspaceWriteTargetError(error);
  }
}

export type {
  WorkspaceDirectoryResult,
  WorkspaceFileSearchInput,
  WorkspaceFileSearchMatch,
  WorkspaceFileSearchResult,
  WorkspacePatchResult,
  WorkspaceWriteResult,
} from "@doolittle/contracts";

export interface WorkspaceReadLinesResult
  extends ContractWorkspaceReadLinesResult {
  /** Present when the byte cap stopped the scan before the end of the file. */
  truncated?: boolean;
  sizeBytes?: number;
  readBytes?: number;
  limitBytes?: number;
}

export interface WorkspaceTextReadResult {
  path: string;
  content: string;
  truncated: boolean;
  sizeBytes: number;
  readBytes: number;
  limitBytes: number;
}

export interface WorkspaceFileReadResult {
  path: string;
  sizeBytes: number;
  limitBytes: number;
  binary: boolean;
  tooLarge: boolean;
  content?: string;
}

/**
 * Read a workspace file for the editor. Content is only returned when the
 * file is small enough to edit and decodes as lossless UTF-8; anything else
 * is reported honestly so the client cannot save back corrupted bytes.
 */
export function readWorkspaceFile(
  workspaceDir: string,
  path: string,
): WorkspaceFileReadResult {
  const resolvedPath = resolveWorkspaceServicePath(workspaceDir, path, "read");
  if (!existsSync(resolvedPath)) {
    throw new Error(`Path not found: ${path}`);
  }
  // Follow the final link like the write path does; confinement was already
  // validated against the workspace root.
  const target = realpathSync(resolvedPath);
  const sizeBytes = statSync(target).size;
  const result: WorkspaceFileReadResult = {
    path: target,
    sizeBytes,
    limitBytes: MAX_EDITABLE_FILE_BYTES,
    binary: false,
    tooLarge: false,
  };

  let bytes: Buffer;
  try {
    bytes = readRegularFileSync(target, MAX_EDITABLE_FILE_BYTES);
  } catch (error) {
    if (error instanceof RegularFileError && error.code === "too_large") {
      result.tooLarge = true;
      return result;
    }
    throw error;
  }

  // NUL bytes never appear in plain text and a fatal decode rejects content
  // that UTF-8 cannot represent, so re-encoding always reproduces the file.
  if (!bytes.includes(0)) {
    try {
      result.content = new TextDecoder("utf8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
      return result;
    } catch {
      // Invalid UTF-8 cannot round-trip through the editor; report it as binary.
    }
  }
  result.binary = true;
  return result;
}

interface WorkspaceFilePrefix {
  bytes: Buffer;
  truncated: boolean;
  sizeBytes: number;
  readBytes: number;
}

function readRegularFilePrefixSync(
  path: string,
  maxBytes: number,
): WorkspaceFilePrefix {
  const fd = openSync(
    path,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    const before = fstatSync(fd);
    if (!before.isFile()) throw new RegularFileError("not_regular");
    const length = Math.min(before.size, maxBytes);
    const bytes = Buffer.alloc(length);
    let readBytes = 0;
    while (readBytes < length) {
      const count = readSync(
        fd,
        bytes,
        readBytes,
        length - readBytes,
        readBytes,
      );
      if (count === 0) break;
      readBytes += count;
    }
    const after = fstatSync(fd);
    const sizeBytes = Math.max(before.size, after.size);
    return {
      bytes: bytes.subarray(0, readBytes),
      truncated: sizeBytes > readBytes,
      sizeBytes,
      readBytes,
    };
  } finally {
    closeSync(fd);
  }
}

function readWorkspaceTextPath(
  resolvedPath: string,
): Omit<WorkspaceTextReadResult, "path"> {
  // Follow the final link like the write path does; confinement was already
  // validated against the workspace root.
  const target = realpathSync(resolvedPath);
  const prefix = readRegularFilePrefixSync(target, MAX_EDITABLE_FILE_BYTES);
  return {
    content: prefix.bytes.toString("utf8"),
    truncated: prefix.truncated,
    sizeBytes: prefix.sizeBytes,
    readBytes: prefix.readBytes,
    limitBytes: MAX_EDITABLE_FILE_BYTES,
  };
}

export function workspaceReadTruncationNotice(
  result: Pick<
    WorkspaceTextReadResult,
    "limitBytes" | "readBytes" | "sizeBytes"
  >,
): string {
  return `[Doolittle truncated this workspace read after the first ${result.readBytes} of ${result.sizeBytes} bytes (limit ${result.limitBytes}). Later content was not returned.]`;
}

/** Agent-facing whole-file reads return a bounded prefix, never a silent one. */
export function readWorkspaceText(
  workspaceDir: string,
  path: string,
): WorkspaceTextReadResult {
  const resolvedPath = resolveWorkspaceServicePath(workspaceDir, path, "read");
  if (!existsSync(resolvedPath)) {
    throw new Error(`Path not found: ${path}`);
  }
  return { path: resolvedPath, ...readWorkspaceTextPath(resolvedPath) };
}

export function readWorkspaceLines(
  workspaceDir: string,
  path: string,
  options: { offset?: number; limit?: number } = {},
): WorkspaceReadLinesResult {
  const resolvedPath = resolveWorkspaceServicePath(workspaceDir, path, "read");
  if (!existsSync(resolvedPath)) {
    throw new Error(`Path not found: ${path}`);
  }

  const offset = Math.max(1, Math.floor(options.offset ?? 1));
  const limit = Math.min(
    MAX_READ_LIMIT,
    Math.max(1, Math.floor(options.limit ?? DEFAULT_READ_LIMIT)),
  );
  const read = readWorkspaceTextPath(resolvedPath);
  const allLines = read.content.split(/\r?\n/u);
  const lines = allLines
    .slice(offset - 1, offset - 1 + limit)
    .map((text, index) => ({ number: offset + index, text }));

  return {
    path: resolvedPath,
    offset,
    end: lines.at(-1)?.number ?? offset - 1,
    total: allLines.length,
    lines,
    ...(read.truncated
      ? {
          truncated: true,
          sizeBytes: read.sizeBytes,
          readBytes: read.readBytes,
          limitBytes: read.limitBytes,
        }
      : {}),
  };
}

export function createWorkspaceDirectory(
  workspaceDir: string,
  path: string,
): WorkspaceDirectoryResult {
  const resolvedPath = resolveWorkspaceServicePath(workspaceDir, path, "write");
  const existed = existsSync(resolvedPath);
  mkdirSync(resolvedPath, { recursive: true });
  return { path: resolvedPath, existed };
}

export function planWorkspacePatch(
  workspaceDir: string,
  path: string,
  oldText: string,
  newText: string,
  options: { replaceAll?: boolean } = {},
): WorkspacePatchPlan {
  const resolvedPath = resolveWorkspaceServicePath(workspaceDir, path, "write");
  if (!existsSync(resolvedPath)) {
    throw new Error(`Path not found: ${path}`);
  }
  if (!oldText) {
    throw new Error("oldText is required for PATCH_FILE.");
  }

  let current: string;
  try {
    // Patches rewrite the whole file, so a truncated source would corrupt data.
    // Rejecting oversized files is the honest mutation-side counterpart to the
    // bounded partial reads exposed to inspection tools.
    current = readRegularFileSync(
      realpathSync(resolvedPath),
      MAX_EDITABLE_FILE_BYTES,
    ).toString("utf8");
  } catch (error) {
    if (error instanceof RegularFileError && error.code === "too_large") {
      throw new Error(
        `File exceeds the ${MAX_EDITABLE_FILE_BYTES}-byte patch limit: ${path}`,
      );
    }
    throw error;
  }
  let matches = 0;
  let offset = current.indexOf(oldText);
  while (offset !== -1) {
    matches += 1;
    offset = current.indexOf(
      oldText,
      offset + (options.replaceAll ? oldText.length : 1),
    );
  }
  if (matches === 0) {
    throw new Error(`oldText was not found in ${resolvedPath}.`);
  }
  if (!options.replaceAll && matches > 1) {
    throw new Error(
      `oldText matched ${matches} times in ${resolvedPath}; set replaceAll=true or provide more context.`,
    );
  }

  return {
    path: resolvedPath,
    content: options.replaceAll
      ? current.split(oldText).join(newText)
      : current.replace(oldText, () => newText),
    replacements: options.replaceAll ? matches : 1,
  };
}

export function applyWorkspacePatch(
  plan: WorkspacePatchPlan,
): WorkspacePatchResult {
  writeFileSync(plan.path, plan.content, "utf8");
  return {
    path: plan.path,
    bytes: Buffer.byteLength(plan.content, "utf8"),
    replacements: plan.replacements,
  };
}

export function writeWorkspaceFile(
  workspaceDir: string,
  path: string,
  content: string,
  expected?: WorkspaceWriteExpectation,
): WorkspaceWriteResult {
  const resolvedPath = resolveWorkspaceServicePath(workspaceDir, path, "write");
  const bytes = Buffer.byteLength(content, "utf8");
  if (expected) {
    checkWorkspaceWriteTarget(() => {
      let target: string;
      try {
        target = realpathSync(resolvedPath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (!expected.recreateMissing || code !== "ENOENT") throw error;
        // The explicit overwrite choice makes recreation honest, but O_EXCL
        // still refuses to replace a file recreated concurrently on disk.
        mkdirSync(dirname(resolvedPath), { recursive: true });
        const fd = openSync(
          resolvedPath,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            (constants.O_NOFOLLOW ?? 0),
        );
        try {
          writeFileSync(fd, content, "utf8");
        } finally {
          closeSync(fd);
        }
        return;
      }

      if (expected.existed && target !== expected.target) {
        throw new WorkspaceWriteConflictError();
      }
      const fd = openSync(
        target,
        constants.O_RDWR |
          (constants.O_NOFOLLOW ?? 0) |
          (constants.O_NONBLOCK ?? 0),
      );
      try {
        const current = readRegularFileDescriptorSync(
          fd,
          expected.bytes.byteLength,
        );
        if (!current.equals(expected.bytes))
          throw new WorkspaceWriteConflictError();
        writeFileSync(fd, content, "utf8");
        ftruncateSync(fd, bytes);
      } finally {
        closeSync(fd);
      }
    });
  } else {
    mkdirSync(dirname(resolvedPath), { recursive: true });
    writeFileSync(resolvedPath, content, "utf8");
  }
  return { path: resolvedPath, bytes };
}

export function searchWorkspaceFiles(
  workspaceDir: string,
  input: WorkspaceFileSearchInput,
): WorkspaceFileSearchResult {
  const pattern = input.pattern.trim();
  if (!pattern) {
    throw new Error("Search pattern is required.");
  }

  const resolvedRoot = resolveWorkspaceServicePath(
    workspaceDir,
    input.path?.trim() || ".",
    "read",
  );
  if (!existsSync(resolvedRoot)) {
    throw new Error(`Path not found: ${input.path ?? "."}`);
  }

  const target = input.target === "files" ? "files" : "content";
  const limit = Math.min(
    MAX_SEARCH_RESULTS,
    Math.max(1, Math.floor(input.limit ?? 50)),
  );
  const regex = toRegex(pattern);
  const candidates = collectVisibleFiles(
    workspaceDir,
    resolvedRoot,
    Math.max(limit, limit * 20),
  );
  const matches: WorkspaceFileSearchMatch[] = [];

  for (const file of candidates) {
    if (matches.length >= limit) break;
    const displayPath =
      workspaceRelativePath(relative(workspaceDir, file)) || file;

    if (target === "files") {
      if (regex.test(displayPath)) {
        matches.push({ path: displayPath });
      }
      continue;
    }

    try {
      const lines = readRegularFileSync(file, MAX_SEARCH_FILE_BYTES)
        .toString("utf8")
        .split(/\r?\n/u);
      for (const [index, text] of lines.entries()) {
        if (regex.test(text)) {
          matches.push({ path: displayPath, line: index + 1, text });
          if (matches.length >= limit) break;
        }
      }
    } catch {
      // Files may disappear or become unreadable while a live workspace changes.
    }
  }

  return {
    root: resolvedRoot,
    pattern,
    target,
    matches,
  };
}

function collectVisibleFiles(
  workspaceDir: string,
  root: string,
  limit: number,
): string[] {
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink()) return [];
  if (rootStat.isFile()) {
    return isVisibleCandidate(workspaceDir, root) ? [root] : [];
  }

  const files: string[] = [];
  const stack = [root];
  while (stack.length && files.length < limit) {
    const current = stack.pop();
    if (!current) continue;

    let entries: string[];
    try {
      entries = readdirSync(current).sort((left, right) =>
        right.localeCompare(left),
      );
    } catch {
      continue;
    }

    for (const entry of entries) {
      const candidate = join(current, entry);
      if (!isVisibleCandidate(workspaceDir, candidate)) continue;
      try {
        const stat = lstatSync(candidate);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) {
          stack.push(candidate);
        } else if (stat.isFile()) {
          files.push(candidate);
          if (files.length >= limit) break;
        }
      } catch {
        // A live workspace can change between directory enumeration and stat.
      }
    }
  }
  return files;
}

function isVisibleCandidate(workspaceDir: string, path: string): boolean {
  const relativePath = workspaceRelativePath(relative(workspaceDir, path));
  return !relativePath || isWorkspacePathVisible(relativePath);
}

function toRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "iu");
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu");
  }
}
