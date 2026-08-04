import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { resolveWorkspaceServicePath } from "./path";
import { workspaceRelativePath } from "./path-format";
import { isWorkspacePathVisible } from "./policy";

const DEFAULT_READ_LIMIT = 500;
const MAX_READ_LIMIT = 2_000;
const MAX_SEARCH_RESULTS = 100;
const MAX_SEARCH_FILE_BYTES = 1_000_000;

export interface WorkspaceReadLinesResult {
  path: string;
  offset: number;
  end: number;
  total: number;
  lines: Array<{ number: number; text: string }>;
}

export interface WorkspaceWriteResult {
  path: string;
  bytes: number;
}

export interface WorkspaceDirectoryResult {
  path: string;
  existed: boolean;
}

export interface WorkspacePatchPlan {
  path: string;
  content: string;
  replacements: number;
}

export interface WorkspacePatchResult extends WorkspaceWriteResult {
  replacements: number;
}

export interface WorkspaceFileSearchInput {
  pattern: string;
  path?: string;
  target?: "content" | "files";
  limit?: number;
}

export interface WorkspaceFileSearchMatch {
  path: string;
  line?: number;
  text?: string;
}

export interface WorkspaceFileSearchResult {
  root: string;
  pattern: string;
  target: "content" | "files";
  matches: WorkspaceFileSearchMatch[];
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
  const allLines = readFileSync(resolvedPath, "utf8").split(/\r?\n/u);
  const lines = allLines
    .slice(offset - 1, offset - 1 + limit)
    .map((text, index) => ({ number: offset + index, text }));

  return {
    path: resolvedPath,
    offset,
    end: lines.at(-1)?.number ?? offset - 1,
    total: allLines.length,
    lines,
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

  const current = readFileSync(resolvedPath, "utf8");
  const matches = current.split(oldText).length - 1;
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
      : current.replace(oldText, newText),
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
): WorkspaceWriteResult {
  const resolvedPath = resolveWorkspaceServicePath(workspaceDir, path, "write");
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, content, "utf8");
  return {
    path: resolvedPath,
    bytes: Buffer.byteLength(content, "utf8"),
  };
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
      const stat = lstatSync(file);
      if (stat.size > MAX_SEARCH_FILE_BYTES) continue;
      const lines = readFileSync(file, "utf8").split(/\r?\n/u);
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
