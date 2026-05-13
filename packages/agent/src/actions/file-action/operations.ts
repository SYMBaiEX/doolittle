import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  type Stats,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { resolveLocalFilePath } from "./path";

const DEFAULT_READ_LIMIT = 500;
const MAX_READ_LIMIT = 2000;
const MAX_SEARCH_RESULTS = 100;
const MAX_SEARCH_FILE_BYTES = 1_000_000;
const IGNORED_DIRS = new Set([
  ".git",
  ".doolittle",
  "node_modules",
  "dist",
  "coverage",
  ".cache",
  ".turbo",
]);

export interface FileActionContext {
  workspaceDir: string;
}

export function readLocalTextFile(
  context: FileActionContext,
  path: string,
  options: { offset?: number; limit?: number } = {},
): string {
  const resolvedPath = resolveLocalFilePath(path, context.workspaceDir, {
    mustExist: true,
  });
  const offset = Math.max(1, Math.floor(options.offset ?? 1));
  const limit = Math.min(
    MAX_READ_LIMIT,
    Math.max(1, Math.floor(options.limit ?? DEFAULT_READ_LIMIT)),
  );
  const lines = readFileSync(resolvedPath, "utf8").split(/\r?\n/u);
  const selected = lines.slice(offset - 1, offset - 1 + limit);
  const body = selected
    .map((line, index) => `${offset + index}|${line}`)
    .join("\n");

  return [
    `Read: ${resolvedPath}`,
    `Lines: ${offset}-${offset + selected.length - 1} of ${lines.length}`,
    body,
  ]
    .filter(Boolean)
    .join("\n");
}

export function writeLocalTextFile(
  context: FileActionContext,
  path: string,
  content: string,
): string {
  const resolvedPath = resolveLocalFilePath(path, context.workspaceDir);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, content, "utf8");
  return `Wrote: ${resolvedPath}\nBytes: ${Buffer.byteLength(content, "utf8")}`;
}

export function createLocalDirectory(
  context: FileActionContext,
  path: string,
): string {
  const resolvedPath = resolveLocalFilePath(path, context.workspaceDir);
  const existed = existsSync(resolvedPath);
  mkdirSync(resolvedPath, { recursive: true });
  return `${existed ? "Directory already existed" : "Created directory"}: ${resolvedPath}`;
}

export function patchLocalTextFile(
  context: FileActionContext,
  path: string,
  oldText: string,
  newText: string,
  options: { replaceAll?: boolean } = {},
): string {
  const resolvedPath = resolveLocalFilePath(path, context.workspaceDir, {
    mustExist: true,
  });
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

  const next = options.replaceAll
    ? current.split(oldText).join(newText)
    : current.replace(oldText, newText);
  writeFileSync(resolvedPath, next, "utf8");
  return `Patched: ${resolvedPath}\nReplacements: ${options.replaceAll ? matches : 1}`;
}

function collectFiles(root: string, limit: number): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length && files.length < limit) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const next = join(current, entry);
      let stat: Stats;
      try {
        stat = statSync(next);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (!IGNORED_DIRS.has(entry)) {
          stack.push(next);
        }
      } else if (stat.isFile()) {
        files.push(next);
        if (files.length >= limit) {
          break;
        }
      }
    }
  }
  return files;
}

function toRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "iu");
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu");
  }
}

export function searchLocalFiles(
  context: FileActionContext,
  input: {
    pattern: string;
    path?: string;
    target?: "content" | "files";
    limit?: number;
  },
): string {
  const pattern = input.pattern.trim();
  if (!pattern) {
    throw new Error("Search pattern is required.");
  }
  const root = resolveLocalFilePath(
    input.path?.trim() || ".",
    context.workspaceDir,
    { mustExist: true },
  );
  const limit = Math.min(
    MAX_SEARCH_RESULTS,
    Math.max(1, Math.floor(input.limit ?? 50)),
  );
  const regex = toRegex(pattern);
  const stat = statSync(root);
  const files = stat.isFile() ? [root] : collectFiles(root, limit * 20);

  if (input.target === "files") {
    const matches = files
      .filter((file) => regex.test(file))
      .slice(0, limit)
      .map((file) => relative(context.workspaceDir, file) || file);
    return [`File matches for "${pattern}" in ${root}:`, ...matches].join("\n");
  }

  const matches: string[] = [];
  for (const file of files) {
    if (matches.length >= limit) {
      break;
    }
    let stat: Stats;
    try {
      stat = statSync(file);
      if (stat.size > MAX_SEARCH_FILE_BYTES) {
        continue;
      }
      const lines = readFileSync(file, "utf8").split(/\r?\n/u);
      lines.forEach((line, index) => {
        if (matches.length < limit && regex.test(line)) {
          const displayPath = relative(context.workspaceDir, file) || file;
          matches.push(`${displayPath}:${index + 1}: ${line}`);
        }
      });
    } catch {}
  }

  return matches.length
    ? [`Content matches for "${pattern}" in ${root}:`, ...matches].join("\n")
    : `No content matches for "${pattern}" in ${root}.`;
}
