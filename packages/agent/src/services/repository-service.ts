import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryMutationRequest,
  RepositoryMutationResult,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import { runTextProcess } from "@/services/process-execution";
import type {
  CreateRepositoryWorktreeInput,
  RepositoryChange,
  RepositoryPatch,
  RepositorySummary,
  RepositoryWorktree,
} from "./repository/models";
import {
  RepositoryMutationExecutor,
  type RepositoryProcessRunner,
} from "./repository/mutations";
import { parseStatusOutput, parseWorktrees } from "./repository/parsing";
import {
  MAX_WORKTREE_PATH_LENGTH,
  validateBranchName,
  validateWorktreePath,
} from "./repository/validation";
import {
  type RepositoryReviewResult,
  RepositoryReviewService,
} from "./repository-review";
import {
  resolveWorkspaceDirectory,
  type WorkspaceDirectorySource,
} from "./workspace-directory";
import {
  assertWorkspacePathResolvesInside,
  resolveWorkspacePath,
} from "./workspace-service/path";
import { workspaceRelativePath } from "./workspace-service/path-format";

export type {
  CreateRepositoryWorktreeInput,
  RepositoryChange,
  RepositoryPatch,
  RepositorySummary,
  RepositoryWorktree,
} from "./repository/models";

const MAX_PATCH_CHARACTERS = 240_000;

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
  private commandCacheGeneration = 0;

  constructor(
    private readonly workspaceDirectory: WorkspaceDirectorySource,
    private readonly mutationRunner: RepositoryProcessRunner = runTextProcess,
  ) {}

  invalidateWorkspace(): void {
    this.gitRootCache = undefined;
    this.invalidateCommandCache();
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
      const absolutePath = resolveWorkspacePath(root, path);
      assertWorkspacePathResolvesInside(root, absolutePath);
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
      this.invalidateCommandCache();
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

    const { stderr, exitCode } = await this.mutationRunner(
      "git",
      ["worktree", "add", "-b", branch, target],
      {
        cwd: root,
        toolName: "doolittle.repository.worktree-add",
      },
    );
    if (exitCode !== 0) {
      throw new Error(
        stderr.trim() ||
          `Git worktree creation failed with exit code ${exitCode}.`,
      );
    }

    this.invalidateCommandCache();
    const createdPath = realpathSync(target);
    const worktree = (await this.worktrees()).find(
      (candidate) => candidate.path === createdPath,
    );
    if (!worktree) {
      throw new Error("Git did not report the newly created worktree.");
    }
    return worktree;
  }

  async branches(): Promise<RepositoryBranch[]> {
    if (!this.gitRoot()) return [];
    const output = await this.runGit(
      [
        "for-each-ref",
        "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(objectname:short)",
        "refs/heads",
      ],
      "git branches",
      "",
    );
    if (!output) return [];
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name = "", headMarker = "", upstream = "", head = ""] =
          line.split("\0");
        return {
          name,
          current: headMarker === "*",
          ...(upstream ? { upstream } : {}),
          ...(head ? { head } : {}),
        };
      })
      .filter((branch) => Boolean(branch.name));
  }

  async remotes(): Promise<RepositoryRemote[]> {
    if (!this.gitRoot()) return [];
    const output = await this.runGit(["remote", "-v"], "git remotes", "");
    const remotes = new Map<string, RepositoryRemote>();
    for (const line of output.split("\n")) {
      const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/u.exec(line.trim());
      if (!match) continue;
      const [, name, url, direction] = match;
      const remote = remotes.get(name) ?? { name };
      if (direction === "fetch") remote.fetchUrl = url;
      else remote.pushUrl = url;
      remotes.set(name, remote);
    }
    return [...remotes.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async stashes(): Promise<RepositoryStash[]> {
    if (!this.gitRoot()) return [];
    const output = await this.runGit(
      ["stash", "list", "--format=%gd%x00%gs"],
      "git stashes",
      "",
    );
    if (!output) return [];
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [reference = "", message = ""] = line.split("\0");
        const branch = /(?:WIP|On) on ([^:]+):/u.exec(message)?.[1];
        return { reference, message, ...(branch ? { branch } : {}) };
      })
      .filter((stash) => Boolean(stash.reference));
  }

  async conflicts(): Promise<RepositoryConflict[]> {
    if (!this.gitRoot()) return [];
    const output = await this.runGit(
      ["ls-files", "-u", "-z"],
      "git conflicts",
      "",
    );
    if (!output) return [];
    const conflicts = new Map<string, Set<string>>();
    for (const record of output.split("\0").filter(Boolean)) {
      const match = /^\d+\s+[0-9a-f]+\s+(\d)\t(.+)$/u.exec(record);
      if (!match) continue;
      const [, stage, path] = match;
      const stages = conflicts.get(path) ?? new Set<string>();
      stages.add(stage);
      conflicts.set(path, stages);
    }
    return [...conflicts.entries()].map(([path, stages]) => ({
      path,
      stages: [...stages].sort(),
    }));
  }

  async mutate(
    input: RepositoryMutationRequest,
  ): Promise<RepositoryMutationResult> {
    const root = this.gitRoot();
    if (!root) throw new Error("Workspace is not inside a Git repository.");
    return new RepositoryMutationExecutor({
      root,
      workspaceRoot: () => this.workspaceRoot(),
      runner: this.mutationRunner,
      invalidateCache: () => this.invalidateCommandCache(),
      worktrees: () => this.worktrees({ fresh: true }),
      conflicts: () => this.conflicts(),
    }).execute(input);
  }
  private async runGit(
    args: string[],
    cacheKey: string,
    emptyValue = "(no output)",
  ): Promise<string> {
    const cwd = this.gitRoot() ?? this.workspaceRoot();
    const scopedCacheKey = `${cwd}\0${cacheKey}`;
    const cacheGeneration = this.commandCacheGeneration;
    const cached = this.commandCache.get(scopedCacheKey);
    const now = Date.now();
    if (cached && now - cached.capturedAt < 3_000) {
      return cached.value;
    }

    const inflightKey = `${scopedCacheKey}\0${cacheGeneration}`;
    const pending = this.inflight.get(inflightKey);
    if (pending) {
      return pending;
    }

    const promise = (async () => {
      const { stdout, stderr, exitCode } = await this.mutationRunner(
        "git",
        args,
        {
          cwd,
          toolName: "doolittle.repository.git",
        },
      );

      if (exitCode !== 0) {
        throw new Error(
          stderr.trim() || `Command failed with exit code ${exitCode}.`,
        );
      }

      const value = stdout.replace(/\r?\n$/u, "") || emptyValue;
      if (this.commandCacheGeneration === cacheGeneration) {
        this.commandCache.set(scopedCacheKey, {
          capturedAt: Date.now(),
          value,
        });
      }
      return value;
    })();

    this.inflight.set(inflightKey, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(inflightKey);
    }
  }

  private invalidateCommandCache(): void {
    this.commandCacheGeneration += 1;
    this.commandCache.clear();
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
