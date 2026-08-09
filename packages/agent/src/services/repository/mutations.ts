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
  RepositoryConflict,
  RepositoryMutationRequest,
  RepositoryMutationResult,
} from "@doolittle/contracts/repository";
import type {
  TextProcessOptions,
  TextProcessResult,
} from "@/services/process-execution";
import {
  assertWorkspacePathResolvesInside,
  resolveWorkspacePath,
} from "../workspace-service/path";
import { workspaceRelativePath } from "../workspace-service/path-format";
import type { RepositoryWorktree } from "./models";
import {
  hasControlCharacters,
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
} from "./validation";

const MAX_PATCH_CHARACTERS = 240_000;

export type RepositoryProcessRunner = (
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
type PatchMutation = Extract<
  RepositoryMutationRequest,
  { type: "stage-hunk" | "unstage-hunk" | "discard-hunk" }
>;

export interface RepositoryMutationExecutorOptions {
  root: string;
  workspaceRoot: () => string;
  runner: RepositoryProcessRunner;
  invalidateCache: () => void;
  worktrees: () => Promise<RepositoryWorktree[]>;
  conflicts: () => Promise<RepositoryConflict[]>;
}

function cleanOutput(value: string): string {
  return value.replace(/\r?\n$/u, "");
}

function assertNever(value: never): never {
  throw new Error(`Unsupported repository mutation: ${JSON.stringify(value)}.`);
}

function isPatchMutation(
  input: RepositoryMutationRequest,
): input is PatchMutation {
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

export class RepositoryMutationExecutor {
  constructor(private readonly options: RepositoryMutationExecutorOptions) {}

  async execute(
    input: RepositoryMutationRequest,
  ): Promise<RepositoryMutationResult> {
    if (isPatchMutation(input)) return this.runPatchMutation(input);
    const command = await this.mutationCommand(input);
    return this.runCommand(input.type, command);
  }

  private async runCommand(
    type: RepositoryMutationRequest["type"],
    command: RepositoryMutationCommand,
  ): Promise<RepositoryMutationResult> {
    const { stdout, stderr, exitCode } = await this.options.runner(
      command.executable,
      command.args,
      {
        cwd: this.options.root,
        toolName: `doolittle.repository.${type}`,
      },
    );
    const cleanStdout = cleanOutput(stdout);
    const cleanStderr = cleanOutput(stderr);
    const result: RepositoryMutationResult = {
      type,
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
    if (result.ok) this.options.invalidateCache();
    return result;
  }

  private async runPatchMutation(
    input: PatchMutation,
  ): Promise<RepositoryMutationResult> {
    this.validatePatchMutation(input.patch);
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
      const summary =
        input.type === "stage-hunk"
          ? "Staged selected hunk"
          : input.type === "unstage-hunk"
            ? "Unstaged selected hunk"
            : "Discarded selected hunk";
      return await this.runCommand(input.type, {
        executable: "git",
        args,
        summary,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  private async mutationCommand(
    input: RepositoryMutationRequest,
  ): Promise<RepositoryMutationCommand> {
    if (isPullRequestMutation(input))
      return this.pullRequestMutationCommand(input);
    return { executable: "git", ...(await this.gitMutationCommand(input)) };
  }

  private async gitMutationCommand(
    input: GitRepositoryMutation,
  ): Promise<Omit<RepositoryMutationCommand, "executable">> {
    switch (input.type) {
      case "stage":
        return {
          args: ["add", "--", ...this.repositoryPaths(input.paths)],
          summary: "Staged selected files",
        };
      case "unstage":
        return {
          args: [
            "restore",
            "--staged",
            "--",
            ...this.repositoryPaths(input.paths),
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
            ...this.repositoryPaths(input.paths),
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
            ...this.repositoryPaths(input.paths),
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
      case "pull":
        return this.pullCommand(input);
      case "push":
        return this.pushCommand(input);
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
        const path = await this.worktreePath(input.path);
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
        this.assertOperationState("MERGE_HEAD", "merge");
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
        this.assertRebaseState();
        return { args: ["rebase", "--abort"], summary: "Aborted rebase" };
      case "rebase-continue":
        this.assertRebaseState();
        return { args: ["rebase", "--continue"], summary: "Continued rebase" };
      case "cherry-pick":
        return {
          args: ["cherry-pick", validateRef(input.commit, "commit")],
          summary: `Cherry-picked ${input.commit}`,
        };
      case "cherry-pick-continue":
        this.assertOperationState("CHERRY_PICK_HEAD", "cherry-pick");
        return {
          args: ["cherry-pick", "--continue"],
          summary: "Continued cherry-pick",
        };
      case "cherry-pick-abort":
        this.assertOperationState("CHERRY_PICK_HEAD", "cherry-pick");
        return {
          args: ["cherry-pick", "--abort"],
          summary: "Aborted cherry-pick",
        };
      case "conflict-mark-resolved":
        return {
          args: ["add", "--", ...(await this.conflictPaths(input.paths))],
          summary: "Marked conflicts resolved",
        };
      default:
        return assertNever(input);
    }
  }

  private pullCommand(
    input: Extract<GitRepositoryMutation, { type: "pull" }>,
  ): Omit<RepositoryMutationCommand, "executable"> {
    const remote = input.remote
      ? validateGitName(input.remote, "remote name")
      : undefined;
    const branch = input.branch
      ? validateRef(input.branch, "branch")
      : undefined;
    if (branch && !remote)
      throw new Error("A remote is required when selecting a pull branch.");
    return {
      args: ["pull", ...(remote ? [remote] : []), ...(branch ? [branch] : [])],
      summary: "Pulled remote updates",
    };
  }

  private pushCommand(
    input: Extract<GitRepositoryMutation, { type: "push" }>,
  ): Omit<RepositoryMutationCommand, "executable"> {
    const remote = input.remote
      ? validateGitName(input.remote, "remote name")
      : undefined;
    const branch = input.branch
      ? validateRef(input.branch, "branch")
      : undefined;
    const setUpstream =
      validateOptionalBoolean(input.setUpstream, "setUpstream") ?? false;
    if (setUpstream && (!remote || !branch))
      throw new Error("Remote and branch are required when setting upstream.");
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
        if (title === undefined && body === undefined && base === undefined)
          throw new Error("At least one pull request field must be updated.");
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

  private repositoryPaths(paths: unknown): string[] {
    if (!Array.isArray(paths) || paths.length === 0)
      throw new Error("At least one repository-relative path is required.");
    return paths.map((path) => this.repositoryPath(path));
  }

  private repositoryPath(value: unknown): string {
    if (
      typeof value !== "string" ||
      value !== value.trim() ||
      !value ||
      value === "."
    )
      throw new Error("A safe repository-relative path is required.");
    if (
      isAbsolute(value) ||
      /^[A-Za-z]:/u.test(value) ||
      hasControlCharacters(value)
    )
      throw new Error("Path must be repository-relative.");
    const absolute = resolveWorkspacePath(this.options.root, value);
    assertWorkspacePathResolvesInside(this.options.root, absolute);
    const scoped = workspaceRelativePath(relative(this.options.root, absolute));
    if (
      !scoped ||
      scoped === ".." ||
      scoped.startsWith("../") ||
      scoped === ".git" ||
      scoped.startsWith(".git/")
    )
      throw new Error("Path must stay inside the repository worktree.");
    return scoped;
  }

  private async worktreePath(value: unknown): Promise<string> {
    if (
      typeof value !== "string" ||
      value !== value.trim() ||
      !isAbsolute(value)
    )
      throw new Error("A canonical absolute worktree path is required.");
    let canonical: string;
    try {
      canonical = realpathSync(value);
    } catch {
      throw new Error("Worktree path does not exist.");
    }
    if (canonical !== value)
      throw new Error("Worktree path must be canonical.");
    if (canonical === this.options.root)
      throw new Error("The primary repository worktree cannot be removed.");
    const canonicalWorkspace = realpathSync(this.options.workspaceRoot());
    const workspaceRelative = relative(canonicalWorkspace, canonical);
    if (
      !workspaceRelative ||
      workspaceRelative === ".." ||
      workspaceRelative.startsWith(`..${sep}`) ||
      isAbsolute(workspaceRelative)
    )
      throw new Error(
        "Worktree path must stay inside the configured workspace.",
      );
    if (
      !(await this.options.worktrees()).some(
        (worktree) => worktree.path === canonical && !worktree.prunable,
      )
    )
      throw new Error("Worktree path is not an active Git worktree.");
    return canonical;
  }

  private async conflictPaths(paths: unknown): Promise<string[]> {
    const values = this.repositoryPaths(paths);
    const unresolved = new Set(
      (await this.options.conflicts()).map((conflict) => conflict.path),
    );
    const notUnresolved = values.filter((path) => !unresolved.has(path));
    if (notUnresolved.length > 0)
      throw new Error(
        `Only unresolved conflict files can be marked resolved: ${notUnresolved.join(", ")}.`,
      );
    return values;
  }

  private validatePatchMutation(patch: unknown): void {
    if (typeof patch !== "string" || !patch.trim())
      throw new Error("A unified patch is required.");
    if (patch.length > MAX_PATCH_CHARACTERS || patch.includes("\0"))
      throw new Error("Patch is too large or contains invalid characters.");
    if (
      /^(?:GIT binary patch|Binary files |similarity index |rename from |rename to |new file mode |deleted file mode |old mode |new mode )/mu.test(
        patch,
      )
    )
      throw new Error(
        "Only text hunks for existing repository files are supported.",
      );
    const paths = new Set<string>();
    for (const line of patch.split("\n")) {
      if (line.startsWith("diff --git ")) {
        const match = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
        if (!match || match[1] !== match[2])
          throw new Error("Patch contains unsupported or unsafe file headers.");
        paths.add(match[1]);
      }
      if (line.startsWith("--- ") || line.startsWith("+++ ")) {
        const prefix = line.slice(0, 4);
        const candidate = line.slice(4);
        if (!candidate.startsWith(prefix === "--- " ? "a/" : "b/"))
          throw new Error("Patch contains unsupported file headers.");
        paths.add(candidate.slice(2));
      }
    }
    if (
      paths.size === 0 ||
      !/^diff --git /mu.test(patch) ||
      !/^@@ /mu.test(patch)
    )
      throw new Error(
        "A standard unified text diff with at least one hunk is required.",
      );
    for (const path of paths) {
      if (!path || path.includes("\t") || path.includes("\n"))
        throw new Error("Patch contains unsafe file paths.");
      const normalized = this.repositoryPath(path);
      if (normalized !== path || basename(normalized) === ".git")
        throw new Error("Patch path must stay inside the repository worktree.");
    }
  }

  private assertOperationState(marker: string, operation: string): void {
    if (!existsSync(join(this.gitDirectory(), marker)))
      throw new Error(`There is no ${operation} in progress.`);
  }

  private assertRebaseState(): void {
    const gitDirectory = this.gitDirectory();
    if (
      !existsSync(join(gitDirectory, "rebase-merge")) &&
      !existsSync(join(gitDirectory, "rebase-apply"))
    )
      throw new Error("There is no rebase in progress.");
  }

  private gitDirectory(): string {
    const gitEntry = join(this.options.root, ".git");
    if (!existsSync(gitEntry)) throw new Error("Git metadata is unavailable.");
    if (statSync(gitEntry).isDirectory()) return realpathSync(gitEntry);
    const reference = /^gitdir:\s*(.+)\s*$/mu.exec(
      readFileSync(gitEntry, "utf8"),
    )?.[1];
    if (!reference) return gitEntry;
    return realpathSync(
      isAbsolute(reference) ? reference : join(dirname(gitEntry), reference),
    );
  }
}
