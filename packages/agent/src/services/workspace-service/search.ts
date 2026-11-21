import { Buffer } from "node:buffer";
import { lstat, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { RegularFileError, readRegularFile } from "@doolittle/storage";
import { runTextProcess, textProcessCapabilities } from "../process-execution";
import { resolveWorkspaceServicePath } from "./path";
import { workspaceRelativePath } from "./path-format";
import { isWorkspacePathVisible } from "./policy";
import { iterateWorkspaceTree } from "./tree";

const FIRST_RG_BATCH = 256;
const NEXT_RG_BATCH = 2_048;
// The Windows cancellation wrapper places these arguments inside Base64 JSON.
const ARGUMENT_BYTE_BUDGET = process.platform === "win32" ? 20_000 : 96_000;
const FIRST_NATIVE_BATCH = 8;
const SEARCH_READ_CONCURRENCY = 32;
const FAST_READ_BYTES = 2 * 1024 * 1024;
const MAX_MATCH_CHARS = 2_048;

export interface WorkspaceSearchResult {
  path: string;
  matches: string[];
}

export interface WorkspaceSearchOptions {
  path?: string;
  signal?: AbortSignal;
  maxMatchChars?: number;
  singleLink?: boolean;
  requireCanonicalRoot?: boolean;
}

interface SearchCriteria {
  workspaceDir: string;
  pattern: string;
  maxResults: number;
  maxMatchChars: number;
  signal?: AbortSignal;
  singleLink?: boolean;
  readLargeFile: (path: string) => Promise<Buffer>;
}

export async function searchWorkspace(
  workspaceDir: string,
  query: string,
  maxResults = 25,
  options: WorkspaceSearchOptions = {},
): Promise<WorkspaceSearchResult[]> {
  const { signal } = options;
  signal?.throwIfAborted();
  const pattern = query.trim();
  if (!pattern || maxResults <= 0) return [];

  const root = await realpath(workspaceDir);
  if (options.requireCanonicalRoot && root !== resolve(workspaceDir))
    throw new Error(
      "The authorized workspace no longer resolves to its original root.",
    );
  const scope = options.path
    ? resolveWorkspaceServicePath(root, options.path, "read")
    : root;
  const scopePath = workspaceRelativePath(relative(root, scope));
  if (scopePath && !isWorkspacePathVisible(scopePath)) return [];

  const stat = await lstat(scope);
  signal?.throwIfAborted();
  if (
    (!stat.isFile() && !stat.isDirectory()) ||
    (await realpath(scope)) !== scope
  )
    return [];

  async function* files(): AsyncGenerator<string> {
    if (stat.isFile()) {
      if (scopePath) yield scopePath;
      return;
    }
    for await (const entry of iterateWorkspaceTree(root, 8, {
      startDir: scope,
      signal,
      requireCanonicalDirectories: true,
    })) {
      if (entry.type === "file") yield entry.path;
    }
  }

  const requestedMatchLength = Math.floor(
    options.maxMatchChars ?? MAX_MATCH_CHARS,
  );
  let pendingLargeRead = Promise.resolve();
  const readLargeFile = (path: string): Promise<Buffer> => {
    // Allow large text sources via the shared reader's standard limit. Only
    // one file per search uses that slower allocation path at a time.
    const read = pendingLargeRead.then(async () => {
      signal?.throwIfAborted();
      if ((await realpath(path)) !== path)
        throw new RegularFileError("changed");
      return readRegularFile(path, undefined, {
        signal,
        singleLink: options.singleLink,
      });
    });
    pendingLargeRead = read.then(
      () => undefined,
      () => undefined,
    );
    return read;
  };
  const criteria: SearchCriteria = {
    workspaceDir: root,
    pattern,
    maxResults,
    maxMatchChars: Number.isNaN(requestedMatchLength)
      ? MAX_MATCH_CHARS
      : Math.max(1, Math.min(MAX_MATCH_CHARS, requestedMatchLength)),
    signal,
    singleLink: options.singleLink,
    readLargeFile,
  };

  // The SDK router currently provides owned process cancellation on host
  // execution only. Use scoped file reads in other modes so a cancelled
  // request never leaves an uncancellable rg process behind.
  if (!signal || textProcessCapabilities().ownedCancellation) {
    const matches = await searchWithRipgrep(files(), criteria);
    if (matches !== undefined) return matches;
  }
  return searchFiles(files(), { ...criteria, pattern: pattern.toLowerCase() });
}

async function searchWithRipgrep(
  files: AsyncGenerator<string>,
  criteria: SearchCriteria,
): Promise<WorkspaceSearchResult[] | undefined> {
  const { workspaceDir, pattern, maxResults, signal } = criteria;
  const results: WorkspaceSearchResult[] = [];
  for await (const batch of batchSearchPaths(
    files,
    FIRST_RG_BATCH,
    NEXT_RG_BATCH,
    ARGUMENT_BYTE_BUDGET,
  )) {
    signal?.throwIfAborted();
    let candidates: Set<string>;
    try {
      const result = await runTextProcess(
        "rg",
        [
          "--no-config",
          "--files-with-matches",
          "--null",
          "--no-ignore",
          "--fixed-strings",
          "-e",
          pattern,
          "--",
          ...batch.map((path) => (path === "-" ? "./-" : path)),
        ],
        {
          cwd: workspaceDir,
          timeoutMs: 15_000,
          toolName: "doolittle.workspace.search",
          abortSignal: signal,
          requireOwnedCancellation: signal !== undefined,
        },
      );
      signal?.throwIfAborted();
      if (result.exitCode !== 0 && result.exitCode !== 1) return undefined;
      candidates = new Set(
        result.stdout
          .split("\0")
          .map((path) => workspaceRelativePath(path).replace(/^\.\//u, "")),
      );
    } catch (error) {
      signal?.throwIfAborted();
      // A failed native teardown is observable to the caller. Starting a
      // fallback scan in that case could stack more work on an active child.
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "TEXT_PROCESS_TERMINATION_UNCONFIRMED"
      ) {
        throw error;
      }
      return undefined;
    }

    // Treat rg as an index of candidate paths. Return text only from a
    // descriptor-verified read of a visible entry in this request's workspace.
    const matchingPaths = batch.filter((path) => candidates.has(path));
    await collectFileMatches(matchingPaths, criteria, results, true);
    if (results.length >= maxResults) break;
  }
  return results;
}

async function searchFiles(
  files: AsyncGenerator<string>,
  criteria: SearchCriteria,
): Promise<WorkspaceSearchResult[]> {
  const results: WorkspaceSearchResult[] = [];
  for await (const paths of batchSearchPaths(
    files,
    FIRST_NATIVE_BATCH,
    SEARCH_READ_CONCURRENCY,
  )) {
    await collectFileMatches(paths, criteria, results, false);
    if (results.length >= criteria.maxResults) break;
  }
  return results;
}

async function collectFileMatches(
  paths: string[],
  criteria: SearchCriteria,
  results: WorkspaceSearchResult[],
  caseSensitive: boolean,
): Promise<void> {
  const { maxResults, signal } = criteria;
  for (
    let offset = 0;
    offset < paths.length;
    offset += SEARCH_READ_CONCURRENCY
  ) {
    signal?.throwIfAborted();
    const found = await Promise.all(
      paths
        .slice(offset, offset + SEARCH_READ_CONCURRENCY)
        .map(async (path) => ({
          path,
          matches: await matchingLines(path, criteria, caseSensitive),
        })),
    );
    for (const result of found) {
      if (result.matches.length) results.push(result);
      if (results.length >= maxResults) return;
    }
  }
}

async function matchingLines(
  path: string,
  criteria: SearchCriteria,
  caseSensitive: boolean,
): Promise<string[]> {
  const {
    workspaceDir,
    pattern,
    signal,
    maxMatchChars,
    singleLink,
    readLargeFile,
  } = criteria;
  let bytes: Buffer;
  const absolutePath = join(workspaceDir, path);
  try {
    // Native traversal checks the directory before producing candidates.
    // rg candidates have also passed through a separate process in between.
    if (
      (caseSensitive || singleLink) &&
      (await realpath(absolutePath)) !== absolutePath
    )
      return [];
    bytes = await readRegularFile(absolutePath, FAST_READ_BYTES, {
      signal,
      singleLink,
    }).catch((error: unknown) => {
      if (error instanceof RegularFileError && error.code === "too_large")
        return readLargeFile(absolutePath);
      throw error;
    });
  } catch {
    // Files can disappear, change inode, or become unreadable during a scan.
    signal?.throwIfAborted();
    return [];
  }

  signal?.throwIfAborted();
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  if (encoding === "utf-8" && bytes.includes(0)) return [];
  const text =
    encoding === "utf-8"
      ? bytes.toString("utf8").replace(/^\uFEFF/u, "")
      : new TextDecoder(encoding).decode(bytes);
  const matches: string[] = [];
  for (let offset = 0; offset < text.length && matches.length < 3; ) {
    const newline = text.indexOf("\n", offset);
    const line = text
      .slice(offset, newline < 0 ? text.length : newline)
      .replace(/\r$/u, "");
    const hit = (caseSensitive ? line : line.toLowerCase()).indexOf(pattern);
    if (hit >= 0)
      matches.push(matchExcerpt(line, hit, pattern.length, maxMatchChars));
    if (newline < 0) break;
    offset = newline + 1;
  }
  if (!matches.length) return matches;
  try {
    if ((await realpath(absolutePath)) !== absolutePath) return [];
  } catch {
    signal?.throwIfAborted();
    return [];
  }
  signal?.throwIfAborted();
  return matches;
}

function matchExcerpt(
  line: string,
  matchOffset: number,
  matchLength: number,
  limit: number,
): string {
  if (line.length <= limit) return line;
  if (limit < 4) return line.slice(matchOffset, matchOffset + limit);
  const bodyLimit = limit - 2;
  const beforeMatch = Math.min(
    Math.floor(bodyLimit / 3),
    Math.max(0, bodyLimit - matchLength),
  );
  const start = Math.max(0, matchOffset - beforeMatch);
  if (!start) return `${line.slice(0, limit - 1)}…`;
  if (start >= line.length - (limit - 1)) return `…${line.slice(-(limit - 1))}`;
  return `…${line.slice(start, start + bodyLimit)}…`;
}

async function* batchSearchPaths(
  paths: AsyncGenerator<string>,
  firstSize: number,
  nextSize: number,
  byteBudget = Number.POSITIVE_INFINITY,
): AsyncGenerator<string[]> {
  let limit = firstSize;
  let batch: string[] = [];
  let weight = 0;

  for await (const path of paths) {
    // Leave room for quoting and delimiters, including non-ASCII filenames.
    const size = Buffer.byteLength(path, "utf8") + 3;
    if (batch.length && weight + size > byteBudget) {
      yield batch;
      limit = nextSize;
      batch = [];
      weight = 0;
    }
    batch.push(path);
    weight += size;
    if (batch.length === limit) {
      yield batch;
      limit = nextSize;
      batch = [];
      weight = 0;
    }
  }

  if (batch.length) yield batch;
}
