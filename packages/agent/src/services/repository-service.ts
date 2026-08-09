import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryMutationRequest,
  RepositoryMutationResult,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import {
  runTextProcess,
  type TextProcessOptions,
  type TextProcessResult,
} from "@/services/process-execution";
import type {
  CreateRepositoryWorktreeInput,
  RepositoryChange,
  RepositoryPatch,
  RepositorySummary,
  RepositoryWorktree,
} from "./repository/models";
import { parseStatusOutput, parseWorktrees } from "./repository/parsing";
import {
  hasControlCharacters,
  MAX_WORKTREE_PATH_LENGTH,
  validateBranchName,
  validateCommitMessage,
  validateGitName,
  validateMergeMethod,
  validateOptionalBoolean,
  validatePullRequestBody,
  validatePullRequestTitle,
  validateRef,
  validateRemoteUrl,
  validateReviewEvent,
  validateStashReference,
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

type RepositoryProcessRunner = (
  command: string,
  args: readonly string[],
  options: TextProcessOptions,
) => Promise<TextProcessResult>;

interface RepositoryMutationCommand {
  executable: "git" | "gh";
  args: string[];
  summary: string;
}

type PullRequestMutation = Extract<
  RepositoryMutationRequest,
  { type: `pr-${string}` }
>;
type GitRepositoryMutation = Exclude<
  RepositoryMutationRequest,
  PullRequestMutation
>;

function cleanOutput(value: string): string {
  return value.replace(/\r?\n$/u, "");
}

function assertNever(value: never): never {
  throw new Error(`Unsupported repository mutation: ${JSON.stringify(value)}.`);
}

function isPatchMutation(
  input: RepositoryMutationRequest,
): input is Extract<
  RepositoryMutationRequest,
  { type: "stage-hunk" | "unstage-hunk" | "discard-hunk" }
> {
  return (
    input.type === "stage-hunk" ||
    input.type === "unstage-hunk" ||
    input.type === "discard-hunk"
  );
}

function isPullRequestMutation(
  input: RepositoryMutationRequest,
): input is PullRequestMutation {
  return input.type.startsWith("pr-");
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
    if (isPatchMutation(input)) {
      return this.runPatchMutation(input, root);
    }
    const command = await this.mutationCommand(input, root);
    const { stdout, stderr, exitCode } = await this.mutationRunner(
      command.executable,
      command.args,
      {
        cwd: root,
        toolName: `doolittle.repository.${input.type}`,
      },
    );
    const cleanStdout = cleanOutput(stdout);
    const cleanStderr = cleanOutput(stderr);
    const result: RepositoryMutationResult = {
      type: input.type,
      ok: exitCode === 0,
      summary: exitCode === 0 ? command.summary : `${command.summary} failed.`,
      stdout: cleanStdout,
      stderr: cleanStderr,
      exitCode,
      ...(exitCode === 0
        ? {}
        : {
            error:
              cleanStderr || cleanStdout || `Git exited with code ${exitCode}.`,
          }),
    };
    if (result.ok) this.invalidateCommandCache();
    return result;
  }

  private async runPatchMutation(
    input: Extract<
      RepositoryMutationRequest,
      { type: "stage-hunk" | "unstage-hunk" | "discard-hunk" }
    >,
    root: string,
  ): Promise<RepositoryMutationResult> {
    this.validatePatchMutation(input.patch, root);
    const directory = mkdtempSync(join(tmpdir(), "doolittle-git-patch-"));
    const patchFile = join(directory, "selection.patch");
    try {
      writeFileSync(
        patchFile,
        input.patch.endsWith("\n") ? input.patch : `${input.patch}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      const args = [
        "apply",
        "--recount",
        ...(input.type === "stage-hunk" || input.type === "unstage-hunk"
          ? ["--cached"]
          : []),
        ...(input.type === "unstage-hunk" || input.type === "discard-hunk"
          ? ["--reverse"]
          : []),
        patchFile,
      ];
      const { stdout, stderr, exitCode } = await this.mutationRunner(
        "git",
        args,
        {
          cwd: root,
          toolName: `doolittle.repository.${input.type}`,
        },
      );
      const cleanStdout = cleanOutput(stdout);
      const cleanStderr = cleanOutput(stderr);
      const summary =
        input.type === "stage-hunk"
          ? "Staged selected hunk"
          : input.type === "unstage-hunk"
            ? "Unstaged selected hunk"
            : "Discarded selected hunk";
      const result: RepositoryMutationResult = {
        type: input.type,
        ok: exitCode === 0,
        summary: exitCode === 0 ? summary : `${summary} failed.`,
        stdout: cleanStdout,
        stderr: cleanStderr,
        exitCode,
        ...(exitCode === 0
          ? {}
          : {
              error:
                cleanStderr ||
                cleanStdout ||
                `Git exited with code ${exitCode}.`,
            }),
      };
      if (result.ok) this.invalidateCommandCache();
      return result;
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  private async mutationCommand(
    input: RepositoryMutationRequest,
    root: string,
  ): Promise<RepositoryMutationCommand> {
    if (isPullRequestMutation(input)) {
      return this.pullRequestMutationCommand(input);
    }
    return {
      executable: "git",
      ...(await this.gitMutationCommand(input, root)),
    };
  }

  private async gitMutationCommand(
    input: GitRepositoryMutation,
    root: string,
  ): Promise<Omit<RepositoryMutationCommand, "executable">> {
    switch (input.type) {
      case "stage":
        return {
          args: ["add", "--", ...this.repositoryPaths(input.paths, root)],
          summary: "Staged selected files",
        };
      case "unstage":
        return {
          args: [
            "restore",
            "--staged",
            "--",
            ...this.repositoryPaths(input.paths, root),
          ],
          summary: "Unstaged selected files",
        };
      case "stage-all":
        return { args: ["add", "--all"], summary: "Staged all changes" };
      case "unstage-all":
        return { args: ["reset", "--mixed"], summary: "Unstaged all changes" };
      case "discard":
        return {
          args: [
            "restore",
            "--worktree",
            "--",
            ...this.repositoryPaths(input.paths, root),
          ],
          summary: "Discarded tracked file changes",
        };
      case "discard-untracked":
        return {
          args: [
            "clean",
            "-f",
            "-d",
            "--",
            ...this.repositoryPaths(input.paths, root),
          ],
          summary: "Removed selected untracked files",
        };
      case "stage-hunk":
      case "unstage-hunk":
      case "discard-hunk":
        throw new Error("Patch mutation dispatch failed.");
      case "commit": {
        const message = validateCommitMessage(input.message);
        const amend = validateOptionalBoolean(input.amend, "amend") ?? false;
        return {
          args: ["commit", "-m", message, ...(amend ? ["--amend"] : [])],
          summary: amend ? "Amended commit" : "Created commit",
        };
      }
      case "fetch":
        return {
          args: [
            "fetch",
            ...(input.remote
              ? [validateGitName(input.remote, "remote name")]
              : []),
          ],
          summary: "Fetched remote updates",
        };
      case "pull": {
        const remote = input.remote
          ? validateGitName(input.remote, "remote name")
          : undefined;
        const branch = input.branch
          ? validateRef(input.branch, "branch")
          : undefined;
        if (branch && !remote)
          throw new Error("A remote is required when selecting a pull branch.");
        return {
          args: [
            "pull",
            ...(remote ? [remote] : []),
            ...(branch ? [branch] : []),
          ],
          summary: "Pulled remote updates",
        };
      }
      case "push": {
        const remote = input.remote
          ? validateGitName(input.remote, "remote name")
          : undefined;
        const branch = input.branch
          ? validateRef(input.branch, "branch")
          : undefined;
        const setUpstream =
          validateOptionalBoolean(input.setUpstream, "setUpstream") ?? false;
        if (setUpstream && (!remote || !branch))
          throw new Error(
            "Remote and branch are required when setting upstream.",
          );
        if (branch && !remote)
          throw new Error("A remote is required when selecting a push branch.");
        return {
          args: [
            "push",
            ...(setUpstream ? ["--set-upstream"] : []),
            ...(remote ? [remote] : []),
            ...(branch ? [branch] : []),
          ],
          summary: "Pushed local commits",
        };
      }
      case "branch-create": {
        const branch = validateBranchName(input.branch);
        const startPoint = input.startPoint
          ? validateRef(input.startPoint, "start point")
          : undefined;
        const checkout =
          validateOptionalBoolean(input.checkout, "checkout") ?? true;
        return {
          args: checkout
            ? ["switch", "-c", branch, ...(startPoint ? [startPoint] : [])]
            : ["branch", branch, ...(startPoint ? [startPoint] : [])],
          summary: checkout
            ? `Created and switched to ${branch}`
            : `Created ${branch}`,
        };
      }
      case "branch-switch":
        return {
          args: ["switch", validateBranchName(input.branch)],
          summary: `Switched to ${input.branch}`,
        };
      case "branch-delete": {
        const force = validateOptionalBoolean(input.force, "force") ?? false;
        return {
          args: [
            "branch",
            force ? "-D" : "-d",
            validateBranchName(input.branch),
          ],
          summary: `Deleted ${input.branch}`,
        };
      }
      case "stash-create": {
        const message =
          input.message === undefined
            ? undefined
            : validateCommitMessage(input.message);
        const includeUntracked =
          validateOptionalBoolean(input.includeUntracked, "includeUntracked") ??
          false;
        return {
          args: [
            "stash",
            "push",
            ...(includeUntracked ? ["--include-untracked"] : []),
            ...(message ? ["--message", message] : []),
          ],
          summary: "Created stash",
        };
      }
      case "stash-apply":
        return {
          args: ["stash", "apply", validateStashReference(input.reference)],
          summary: "Applied stash",
        };
      case "stash-pop":
        return {
          args: [
            "stash",
            "pop",
            ...(input.reference
              ? [validateStashReference(input.reference)]
              : []),
          ],
          summary: "Applied and removed stash",
        };
      case "stash-drop":
        return {
          args: ["stash", "drop", validateStashReference(input.reference)],
          summary: "Dropped stash",
        };
      case "worktree-remove": {
        const path = await this.worktreePath(input.path, root);
        const force = validateOptionalBoolean(input.force, "force") ?? false;
        return {
          args: ["worktree", "remove", ...(force ? ["--force"] : []), path],
          summary: "Removed worktree",
        };
      }
      case "worktree-prune":
        return { args: ["worktree", "prune"], summary: "Pruned worktrees" };
      case "remote-add":
        return {
          args: [
            "remote",
            "add",
            validateGitName(input.name, "remote name"),
            validateRemoteUrl(input.url),
          ],
          summary: `Added remote ${input.name}`,
        };
      case "remote-remove":
        return {
          args: [
            "remote",
            "remove",
            validateGitName(input.name, "remote name"),
          ],
          summary: `Removed remote ${input.name}`,
        };
      case "remote-set-url":
        return {
          args: [
            "remote",
            "set-url",
            validateGitName(input.name, "remote name"),
            validateRemoteUrl(input.url),
          ],
          summary: `Updated remote ${input.name}`,
        };
      case "merge-abort":
        this.assertOperationState(root, "MERGE_HEAD", "merge");
        return { args: ["merge", "--abort"], summary: "Aborted merge" };
      case "merge": {
        const noFf = validateOptionalBoolean(input.noFf, "noFf") ?? false;
        return {
          args: [
            "merge",
            ...(noFf ? ["--no-ff"] : []),
            validateRef(input.branch, "branch"),
          ],
          summary: `Merged ${input.branch}`,
        };
      }
      case "rebase":
        return {
          args: ["rebase", validateRef(input.branch, "branch")],
          summary: `Rebased onto ${input.branch}`,
        };
      case "rebase-abort":
        this.assertRebaseState(root);
        return { args: ["rebase", "--abort"], summary: "Aborted rebase" };
      case "rebase-continue":
        this.assertRebaseState(root);
        return { args: ["rebase", "--continue"], summary: "Continued rebase" };
      case "cherry-pick":
        return {
          args: ["cherry-pick", validateRef(input.commit, "commit")],
          summary: `Cherry-picked ${input.commit}`,
        };
      case "cherry-pick-continue":
        this.assertOperationState(root, "CHERRY_PICK_HEAD", "cherry-pick");
        return {
          args: ["cherry-pick", "--continue"],
          summary: "Continued cherry-pick",
        };
      case "cherry-pick-abort":
        this.assertOperationState(root, "CHERRY_PICK_HEAD", "cherry-pick");
        return {
          args: ["cherry-pick", "--abort"],
          summary: "Aborted cherry-pick",
        };
      case "conflict-mark-resolved":
        return {
          args: ["add", "--", ...(await this.conflictPaths(input.paths, root))],
          summary: "Marked conflicts resolved",
        };
      default:
        return assertNever(input);
    }
  }

  private pullRequestMutationCommand(
    input: PullRequestMutation,
  ): RepositoryMutationCommand {
    switch (input.type) {
      case "pr-create": {
        const title = validatePullRequestTitle(input.title);
        const body = validatePullRequestBody(input.body) ?? "";
        const base = input.base
          ? validateRef(input.base, "base branch")
          : undefined;
        const draft = validateOptionalBoolean(input.draft, "draft") ?? false;
        return {
          executable: "gh",
          args: [
            "pr",
            "create",
            "--title",
            title,
            "--body",
            body,
            ...(base ? ["--base", base] : []),
            ...(draft ? ["--draft"] : []),
          ],
          summary: "Created pull request",
        };
      }
      case "pr-update": {
        const title =
          input.title === undefined
            ? undefined
            : validatePullRequestTitle(input.title);
        const body = validatePullRequestBody(input.body);
        const base = input.base
          ? validateRef(input.base, "base branch")
          : undefined;
        if (title === undefined && body === undefined && base === undefined) {
          throw new Error("At least one pull request field must be updated.");
        }
        return {
          executable: "gh",
          args: [
            "pr",
            "edit",
            ...(title === undefined ? [] : ["--title", title]),
            ...(body === undefined ? [] : ["--body", body]),
            ...(base ? ["--base", base] : []),
          ],
          summary: "Updated pull request",
        };
      }
      case "pr-ready":
        return {
          executable: "gh",
          args: ["pr", "ready"],
          summary: "Marked pull request ready for review",
        };
      case "pr-review": {
        const event = validateReviewEvent(input.event);
        const body = validatePullRequestBody(input.body);
        const flag =
          event === "approve"
            ? "--approve"
            : event === "request-changes"
              ? "--request-changes"
              : "--comment";
        return {
          executable: "gh",
          args: [
            "pr",
            "review",
            flag,
            ...(body === undefined ? [] : ["--body", body]),
          ],
          summary:
            event === "approve"
              ? "Approved pull request"
              : event === "request-changes"
                ? "Requested pull request changes"
                : "Commented on pull request",
        };
      }
      case "pr-merge": {
        const method = validateMergeMethod(input.method);
        const deleteBranch =
          validateOptionalBoolean(input.deleteBranch, "deleteBranch") ?? false;
        return {
          executable: "gh",
          args: [
            "pr",
            "merge",
            `--${method}`,
            ...(deleteBranch ? ["--delete-branch"] : []),
          ],
          summary: `Merged pull request with ${method}`,
        };
      }
      case "pr-close": {
        const deleteBranch =
          validateOptionalBoolean(input.deleteBranch, "deleteBranch") ?? false;
        return {
          executable: "gh",
          args: ["pr", "close", ...(deleteBranch ? ["--delete-branch"] : [])],
          summary: "Closed pull request",
        };
      }
      case "pr-reopen":
        return {
          executable: "gh",
          args: ["pr", "reopen"],
          summary: "Reopened pull request",
        };
      default:
        return assertNever(input);
    }
  }

  private repositoryPaths(paths: unknown, root: string): string[] {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new Error("At least one repository-relative path is required.");
    }
    return paths.map((path) => this.repositoryPath(path, root));
  }

  private repositoryPath(value: unknown, root: string): string {
    if (
      typeof value !== "string" ||
      value !== value.trim() ||
      !value ||
      value === "."
    ) {
      throw new Error("A safe repository-relative path is required.");
    }
    if (
      isAbsolute(value) ||
      /^[A-Za-z]:/u.test(value) ||
      hasControlCharacters(value)
    ) {
      throw new Error("Path must be repository-relative.");
    }
    const absolute = resolveWorkspacePath(root, value);
    assertWorkspacePathResolvesInside(root, absolute);
    const scoped = workspaceRelativePath(relative(root, absolute));
    if (
      !scoped ||
      scoped === ".." ||
      scoped.startsWith("../") ||
      scoped === ".git" ||
      scoped.startsWith(".git/")
    ) {
      throw new Error("Path must stay inside the repository worktree.");
    }
    return scoped;
  }

  private async worktreePath(value: unknown, root: string): Promise<string> {
    if (
      typeof value !== "string" ||
      value !== value.trim() ||
      !isAbsolute(value)
    ) {
      throw new Error("A canonical absolute worktree path is required.");
    }
    let canonical: string;
    try {
      canonical = realpathSync(value);
    } catch {
      throw new Error("Worktree path does not exist.");
    }
    if (canonical !== value)
      throw new Error("Worktree path must be canonical.");
    if (canonical === root)
      throw new Error("The primary repository worktree cannot be removed.");
    const canonicalWorkspace = realpathSync(this.workspaceRoot());
    const workspaceRelative = relative(canonicalWorkspace, canonical);
    if (
      !workspaceRelative ||
      workspaceRelative === ".." ||
      workspaceRelative.startsWith(`..${sep}`) ||
      isAbsolute(workspaceRelative)
    ) {
      throw new Error(
        "Worktree path must stay inside the configured workspace.",
      );
    }
    const active = (await this.worktrees({ fresh: true })).some(
      (worktree) => worktree.path === canonical && !worktree.prunable,
    );
    if (!active)
      throw new Error("Worktree path is not an active Git worktree.");
    return canonical;
  }

  private async conflictPaths(paths: unknown, root: string): Promise<string[]> {
    const values = this.repositoryPaths(paths, root);
    const unresolved = new Set(
      (await this.conflicts()).map((conflict) => conflict.path),
    );
    const notUnresolved = values.filter((path) => !unresolved.has(path));
    if (notUnresolved.length > 0) {
      throw new Error(
        `Only unresolved conflict files can be marked resolved: ${notUnresolved.join(", ")}.`,
      );
    }
    return values;
  }

  private validatePatchMutation(patch: unknown, root: string): void {
    if (typeof patch !== "string" || !patch.trim())
      throw new Error("A unified patch is required.");
    if (patch.length > MAX_PATCH_CHARACTERS || patch.includes("\0"))
      throw new Error("Patch is too large or contains invalid characters.");
    if (
      /^(?:GIT binary patch|Binary files |similarity index |rename from |rename to |new file mode |deleted file mode |old mode |new mode )/mu.test(
        patch,
      )
    ) {
      throw new Error(
        "Only text hunks for existing repository files are supported.",
      );
    }

    const paths = new Set<string>();
    for (const line of patch.split("\n")) {
      if (line.startsWith("diff --git ")) {
        const match = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
        if (!match || match[1] !== match[2]) {
          throw new Error("Patch contains unsupported or unsafe file headers.");
        }
        paths.add(match[1]);
      }
      if (line.startsWith("--- ") || line.startsWith("+++ ")) {
        const prefix = line.slice(0, 4);
        const candidate = line.slice(4);
        if (!candidate.startsWith(prefix === "--- " ? "a/" : "b/")) {
          throw new Error("Patch contains unsupported file headers.");
        }
        paths.add(candidate.slice(2));
      }
    }
    if (
      paths.size === 0 ||
      !/^diff --git /mu.test(patch) ||
      !/^@@ /mu.test(patch)
    ) {
      throw new Error(
        "A standard unified text diff with at least one hunk is required.",
      );
    }
    for (const path of paths) {
      if (!path || path.includes("\t") || path.includes("\n")) {
        throw new Error("Patch contains unsafe file paths.");
      }
      const normalized = this.repositoryPath(path, root);
      if (normalized !== path || basename(normalized) === ".git") {
        throw new Error("Patch path must stay inside the repository worktree.");
      }
    }
  }

  private assertOperationState(
    root: string,
    marker: string,
    operation: string,
  ): void {
    const gitDirectory = this.gitDirectory(root);
    if (!existsSync(join(gitDirectory, marker))) {
      throw new Error(`There is no ${operation} in progress.`);
    }
  }

  private assertRebaseState(root: string): void {
    const gitDirectory = this.gitDirectory(root);
    if (
      !existsSync(join(gitDirectory, "rebase-merge")) &&
      !existsSync(join(gitDirectory, "rebase-apply"))
    ) {
      throw new Error("There is no rebase in progress.");
    }
  }

  private gitDirectory(root: string): string {
    const gitEntry = join(root, ".git");
    if (!existsSync(gitEntry)) throw new Error("Git metadata is unavailable.");
    if (statSync(gitEntry).isDirectory()) return realpathSync(gitEntry);
    const content = readFileSync(gitEntry, "utf8");
    const reference = /^gitdir:\s*(.+)\s*$/mu.exec(content)?.[1];
    if (!reference) return gitEntry;
    const resolved = isAbsolute(reference)
      ? reference
      : join(dirname(gitEntry), reference);
    return realpathSync(resolved);
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
