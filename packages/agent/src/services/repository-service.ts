import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { spawnTextProcess } from "@/services/process-execution";
import {
  type RepositoryReviewResult,
  RepositoryReviewService,
} from "./repository-review";
import {
  resolveWorkspaceDirectory,
  type WorkspaceDirectorySource,
} from "./workspace-directory";
import {
  resolveWorkspacePath,
  workspaceRelativePath,
} from "./workspace-service/path";

export interface RepositoryChange {
  path: string;
  previousPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface RepositorySummary {
  isRepository: boolean;
  root?: string;
  branch?: string;
  head?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  changedFiles: number;
}

export interface RepositoryPatch {
  path?: string;
  staged: boolean;
  patch: string;
  truncated: boolean;
}

export interface RepositoryWorktree {
  path: string;
  head?: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  prunable: boolean;
}

export interface CreateRepositoryWorktreeInput {
  branch: string;
  path: string;
}

const MAX_PATCH_CHARACTERS = 240_000;
const MAX_BRANCH_LENGTH = 255;
const MAX_WORKTREE_PATH_LENGTH = 4_096;

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function validateBranchName(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error("A branch name is required.");
  }
  if (
    value.length > MAX_BRANCH_LENGTH ||
    value.startsWith("-") ||
    value.includes("\\") ||
    value.includes("..") ||
    value.includes("@{") ||
    value.endsWith(".") ||
    value.endsWith("/") ||
    /[\s~^:?*[\]]/u.test(value) ||
    value.split("/").some((segment) => !segment || segment.endsWith(".lock")) ||
    hasControlCharacters(value)
  ) {
    throw new Error("Branch name is not a valid Git branch.");
  }
  return value;
}

function validateWorktreePath(workspaceDir: string, value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error("A workspace-relative worktree path is required.");
  }
  if (
    value.length > MAX_WORKTREE_PATH_LENGTH ||
    isAbsolute(value) ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes("\\") ||
    hasControlCharacters(value)
  ) {
    throw new Error("Worktree path must be a safe workspace-relative path.");
  }
  let decoded = value;
  try {
    for (let index = 0; index < 6; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    throw new Error("Worktree path contains invalid encoding.");
  }
  if (decoded !== value) {
    throw new Error("Encoded worktree paths are not accepted.");
  }
  if (
    value
      .split("/")
      .some(
        (segment) =>
          !segment || segment === "." || segment === ".." || segment === ".git",
      )
  ) {
    throw new Error("Worktree path contains unsafe traversal tokens.");
  }

  const target = resolveWorkspacePath(workspaceDir, value);
  if (existsSync(target)) {
    throw new Error("Worktree path already exists.");
  }

  let existingAncestor = dirname(target);
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const realWorkspace = realpathSync(workspaceDir);
  const realAncestor = realpathSync(existingAncestor);
  const workspacePrefix = normalize(
    realWorkspace.endsWith(sep) ? realWorkspace : `${realWorkspace}${sep}`,
  );
  if (
    realAncestor !== realWorkspace &&
    !realAncestor.startsWith(workspacePrefix)
  ) {
    throw new Error("Worktree path must stay inside the configured workspace.");
  }
  return target;
}

function parseStatusRecord(record: string): RepositoryChange | null {
  if (record.length < 4) return null;
  const indexStatus = record[0] ?? " ";
  const worktreeStatus = record[1] ?? " ";
  const rawPath = record.slice(3);
  if (!rawPath) return null;
  const untracked = indexStatus === "?" && worktreeStatus === "?";
  return {
    path: rawPath,
    indexStatus,
    worktreeStatus,
    staged: !untracked && indexStatus !== " ",
    unstaged: untracked || worktreeStatus !== " ",
    untracked,
  };
}

function parseStatusOutput(output: string): RepositoryChange[] {
  const records = output.split("\0").filter(Boolean);
  const changes: RepositoryChange[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const change = parseStatusRecord(records[index] ?? "");
    if (!change) continue;
    const renamed =
      ["R", "C"].includes(change.indexStatus) ||
      ["R", "C"].includes(change.worktreeStatus);
    if (renamed && records[index + 1]) {
      change.previousPath = records[index + 1];
      index += 1;
    }
    changes.push(change);
  }
  return changes;
}

function parseWorktrees(output: string): RepositoryWorktree[] {
  if (!output.trim()) return [];
  return output
    .split(/\n\s*\n/u)
    .map((block): RepositoryWorktree | null => {
      const fields = new Map<string, string>();
      const flags = new Set<string>();
      for (const line of block.split("\n")) {
        const [key, ...rest] = line.trim().split(" ");
        if (!key) continue;
        if (rest.length) fields.set(key, rest.join(" "));
        else flags.add(key);
      }
      const path = fields.get("worktree");
      if (!path) return null;
      const branchRef = fields.get("branch");
      const worktree: RepositoryWorktree = {
        path,
        detached: flags.has("detached"),
        bare: flags.has("bare"),
        prunable: flags.has("prunable"),
      };
      const head = fields.get("HEAD");
      if (head) worktree.head = head;
      if (branchRef) {
        worktree.branch = branchRef.replace(/^refs\/heads\//u, "");
      }
      return worktree;
    })
    .filter((worktree): worktree is RepositoryWorktree => worktree !== null);
}

export class RepositoryService {
  private gitRootCache?: {
    workspaceDir: string;
    root: string | null;
  };
  private readonly commandCache = new Map<
    string,
    {
      capturedAt: number;
      value: string;
    }
  >();
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(private readonly workspaceDirectory: WorkspaceDirectorySource) {}

  invalidateWorkspace(): void {
    this.gitRootCache = undefined;
    this.commandCache.clear();
  }

  isRepository(): boolean {
    return Boolean(this.gitRoot());
  }

  async status(): Promise<string> {
    if (!this.gitRoot()) {
      return "(workspace is not inside a git repository)";
    }
    return this.runGit(["status", "--short", "--branch"], "git status");
  }

  async diffStat(): Promise<string> {
    if (!this.gitRoot()) {
      return "(workspace is not inside a git repository)";
    }
    return this.runGit(["diff", "--stat"], "git diff --stat");
  }

  async recentCommits(limit = 5): Promise<string> {
    if (!this.gitRoot()) {
      return "(workspace is not inside a git repository)";
    }
    return this.runGit(
      ["log", "--oneline", "-n", String(limit)],
      `git log --oneline -n ${limit}`,
    );
  }

  review(signal?: AbortSignal): Promise<RepositoryReviewResult> {
    return new RepositoryReviewService(this.workspaceRoot()).review(signal);
  }

  async changes(): Promise<RepositoryChange[]> {
    if (!this.gitRoot()) return [];
    const output = await this.runGit(
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      "git changes",
      "",
    );
    return parseStatusOutput(output);
  }

  async summary(): Promise<RepositorySummary> {
    const root = this.gitRoot();
    if (!root) {
      return {
        isRepository: false,
        ahead: 0,
        behind: 0,
        dirty: false,
        changedFiles: 0,
      };
    }
    const [branch, head, upstream, aheadBehind, changes] = await Promise.all([
      this.runGit(["branch", "--show-current"], "git branch", ""),
      this.runGitOptional(["rev-parse", "--short", "HEAD"], "git head"),
      this.runGitOptional(
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        "git upstream",
      ),
      this.runGitOptional(
        ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
        "git ahead-behind",
      ),
      this.changes(),
    ]);
    const [behindRaw, aheadRaw] = aheadBehind.split(/\s+/u);
    return {
      isRepository: true,
      root,
      branch: branch || undefined,
      head: head || undefined,
      upstream: upstream || undefined,
      ahead: Number.parseInt(aheadRaw ?? "0", 10) || 0,
      behind: Number.parseInt(behindRaw ?? "0", 10) || 0,
      dirty: changes.length > 0,
      changedFiles: changes.length,
    };
  }

  async patch(path?: string, staged = false): Promise<RepositoryPatch> {
    const root = this.gitRoot();
    if (!root) {
      return { path, staged, patch: "", truncated: false };
    }
    const args = ["diff", "--no-ext-diff", "--unified=3"];
    if (staged) args.push("--cached");
    let scopedPath: string | undefined;
    if (path?.trim()) {
      const absolutePath = resolveWorkspacePath(this.workspaceRoot(), path);
      scopedPath = workspaceRelativePath(relative(root, absolutePath));
      args.push("--", scopedPath);
    }
    const output = await this.runGit(
      args,
      `git patch:${staged ? "staged" : "unstaged"}:${scopedPath ?? "*"}`,
      "",
    );
    const truncated = output.length > MAX_PATCH_CHARACTERS;
    return {
      path: path?.trim() || undefined,
      staged,
      patch: truncated ? output.slice(0, MAX_PATCH_CHARACTERS) : output,
      truncated,
    };
  }

  async worktrees(options?: {
    fresh?: boolean;
  }): Promise<RepositoryWorktree[]> {
    if (!this.gitRoot()) return [];
    if (options?.fresh) {
      this.commandCache.clear();
    }
    const output = await this.runGit(
      ["worktree", "list", "--porcelain"],
      "git worktrees",
      "",
    );
    return parseWorktrees(output);
  }

  /**
   * Resolves an operator-supplied execution root to a real, currently listed
   * Git worktree.  Deliberately rejects aliases: a task receipt must name the
   * same canonical directory Git reported when it was approved.
   */
  async resolveWorktreeRoot(value: unknown): Promise<string> {
    if (typeof value !== "string" || !value || value !== value.trim()) {
      throw new Error("A canonical absolute Git worktree path is required.");
    }
    if (!isAbsolute(value) || value.length > MAX_WORKTREE_PATH_LENGTH) {
      throw new Error("Worktree root must be an absolute canonical path.");
    }

    let canonical: string;
    try {
      canonical = realpathSync(value);
    } catch {
      throw new Error("Worktree root does not exist.");
    }
    if (canonical !== value) {
      throw new Error("Worktree root must be its canonical real path.");
    }

    const worktree = (await this.worktrees({ fresh: true })).find(
      (candidate) => candidate.path === canonical,
    );
    if (!worktree || worktree.bare || worktree.prunable) {
      throw new Error("Worktree root is not an active Git worktree.");
    }
    return canonical;
  }

  async createWorktree(
    input: CreateRepositoryWorktreeInput,
  ): Promise<RepositoryWorktree> {
    const root = this.gitRoot();
    if (!root) {
      throw new Error("Workspace is not inside a Git repository.");
    }
    const branch = validateBranchName(input.branch);
    const target = validateWorktreePath(this.workspaceRoot(), input.path);

    try {
      await this.runGit(
        ["check-ref-format", "--branch", branch],
        `git check branch:${branch}`,
        "",
      );
    } catch {
      throw new Error("Branch name is not a valid Git branch.");
    }

    const { completed } = spawnTextProcess(
      "git",
      ["worktree", "add", "-b", branch, target],
      {
        cwd: root,
      },
    );
    const { stderr, exitCode } = await completed;
    if (exitCode !== 0) {
      throw new Error(
        stderr.trim() ||
          `Git worktree creation failed with exit code ${exitCode}.`,
      );
    }

    this.commandCache.clear();
    const createdPath = realpathSync(target);
    const worktree = (await this.worktrees()).find(
      (candidate) => candidate.path === createdPath,
    );
    if (!worktree) {
      throw new Error("Git did not report the newly created worktree.");
    }
    return worktree;
  }

  private async runGit(
    args: string[],
    cacheKey: string,
    emptyValue = "(no output)",
  ): Promise<string> {
    const cwd = this.gitRoot() ?? this.workspaceRoot();
    const scopedCacheKey = `${cwd}\0${cacheKey}`;
    const cached = this.commandCache.get(scopedCacheKey);
    const now = Date.now();
    if (cached && now - cached.capturedAt < 3_000) {
      return cached.value;
    }

    const pending = this.inflight.get(scopedCacheKey);
    if (pending) {
      return pending;
    }

    const promise = (async () => {
      const { completed } = spawnTextProcess("git", args, {
        cwd,
      });

      const { stdout, stderr, exitCode } = await completed;

      if (exitCode !== 0) {
        throw new Error(
          stderr.trim() || `Command failed with exit code ${exitCode}.`,
        );
      }

      const value = stdout.replace(/\r?\n$/u, "") || emptyValue;
      this.commandCache.set(scopedCacheKey, {
        capturedAt: Date.now(),
        value,
      });
      return value;
    })();

    this.inflight.set(scopedCacheKey, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(scopedCacheKey);
    }
  }

  private async runGitOptional(
    args: string[],
    cacheKey: string,
  ): Promise<string> {
    try {
      return await this.runGit(args, cacheKey, "");
    } catch {
      return "";
    }
  }

  private gitRoot(): string | null {
    const workspaceDir = this.workspaceRoot();
    const cache = this.gitRootCache;
    if (cache?.workspaceDir === workspaceDir) {
      return cache.root;
    }
    let current = workspaceDir;

    while (true) {
      if (existsSync(join(current, ".git"))) {
        this.gitRootCache = { workspaceDir, root: current };
        return current;
      }

      const parent = dirname(current);
      if (parent === current) {
        this.gitRootCache = { workspaceDir, root: null };
        return null;
      }

      current = parent;
    }
  }

  private workspaceRoot(): string {
    return resolveWorkspaceDirectory(this.workspaceDirectory);
  }
}
