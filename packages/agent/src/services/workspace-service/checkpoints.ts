import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTextProcess } from "@/services/process-execution";
import { classifyWorkspacePath } from "./policy";

export interface WorkspaceCheckpoint {
  id: string;
  createdAt: string;
  label: string;
  revision: string;
}

export interface WorkspaceCheckpointSupport {
  supported: boolean;
  reason?: string;
}

const CHECKPOINT_REF_PREFIX = "refs/doolittle/checkpoints/";
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Doolittle",
  GIT_AUTHOR_EMAIL: "doolittle@local.invalid",
  GIT_COMMITTER_NAME: "Doolittle",
  GIT_COMMITTER_EMAIL: "doolittle@local.invalid",
};

async function gitRaw(
  root: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  const result = await runTextProcess("git", ["-C", root, ...args], {
    env,
    timeoutMs: 30_000,
    toolName: "doolittle.workspace.checkpoint",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() ||
        `Git checkpoint command failed with exit code ${result.exitCode}.`,
    );
  }
  return result.stdout;
}

async function git(
  root: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  return (await gitRaw(root, args, env)).trim();
}

async function gitPaths(root: string, args: string[]): Promise<string[]> {
  const output = await gitRaw(root, [...args, "-z"]);
  return output ? output.split("\0").filter(Boolean) : [];
}

async function checkpointPaths(root: string): Promise<string[]> {
  return [
    ...new Set([
      ...(await gitPaths(root, ["diff", "--name-only"])),
      ...(await gitPaths(root, ["diff", "--cached", "--name-only"])),
      ...(await gitPaths(root, ["ls-files", "--others", "--exclude-standard"])),
    ]),
  ];
}

function assertCheckpointPathsAreSafe(paths: string[]): void {
  const protectedPath = paths.find(
    (path) => classifyWorkspacePath(path).disposition !== "visible",
  );
  if (protectedPath) {
    throw new Error(
      `Checkpoint blocked because protected workspace data has uncommitted changes: ${protectedPath}`,
    );
  }
}

function checkpointId(): string {
  return `${new Date().toISOString().replace(/[:.]/gu, "-")}-${crypto.randomUUID().slice(0, 8)}`;
}

function checkpointRef(id: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(id)) {
    throw new Error("Invalid checkpoint id.");
  }
  return `${CHECKPOINT_REF_PREFIX}${id}`;
}

function cleanLabel(label?: string): string {
  const normalized = label
    ?.trim()
    .replace(/[\r\n]/gu, " ")
    .slice(0, 120);
  return normalized || "Operator checkpoint";
}

async function repositoryRoot(root: string): Promise<string | null> {
  try {
    return await git(root, ["rev-parse", "--show-toplevel"]);
  } catch {
    return null;
  }
}

/**
 * Git-backed snapshots that never alter the caller's worktree or index while
 * being created. The checkpoint ref points to a commit built from a temporary
 * index. It captures changed paths that are visible to the workspace service,
 * including safe untracked files, while refusing to persist protected data.
 */
export class WorkspaceCheckpointService {
  constructor(private readonly workspaceRoot: () => string) {}

  async support(): Promise<WorkspaceCheckpointSupport> {
    const root = this.workspaceRoot();
    const repository = await repositoryRoot(root);
    if (!repository) {
      return {
        supported: false,
        reason: "The workspace is not a Git repository.",
      };
    }
    if (realpathSync(repository) !== realpathSync(root)) {
      return {
        supported: false,
        reason:
          "Checkpoints require the configured workspace to be the Git repository root.",
      };
    }
    try {
      await git(root, ["rev-parse", "--verify", "HEAD"]);
    } catch {
      return {
        supported: false,
        reason: "Checkpoints require an initial Git commit.",
      };
    }
    return { supported: true };
  }

  async list(): Promise<WorkspaceCheckpoint[]> {
    const support = await this.support();
    if (!support.supported) return [];
    const root = this.workspaceRoot();
    const format =
      "%(refname:strip=3)%00%(objectname)%00%(committerdate:iso-strict)%00%(subject)";
    const output = await git(root, [
      "for-each-ref",
      `--format=${format}`,
      CHECKPOINT_REF_PREFIX,
    ]);
    if (!output) return [];
    return output.split("\n").flatMap((line) => {
      const [id, revision, createdAt, subject] = line.split("\0");
      if (!id || !revision || !createdAt) return [];
      return [
        {
          id,
          revision,
          createdAt,
          label:
            subject?.replace(/^Doolittle checkpoint:\s*/u, "") ||
            "Operator checkpoint",
        },
      ];
    });
  }

  async create(label?: string): Promise<WorkspaceCheckpoint> {
    const support = await this.support();
    if (!support.supported) throw new Error(support.reason);
    const root = this.workspaceRoot();
    const id = checkpointId();
    const safeLabel = cleanLabel(label);
    const paths = await checkpointPaths(root);
    assertCheckpointPathsAreSafe(paths);
    const temporaryDirectory = mkdtempSync(
      join(tmpdir(), "doolittle-checkpoint-"),
    );
    const temporaryIndex = join(temporaryDirectory, "index");
    const pathspecFile = join(temporaryDirectory, "paths");
    const env = {
      ...process.env,
      ...GIT_IDENTITY,
      GIT_INDEX_FILE: temporaryIndex,
    };
    try {
      await git(root, ["read-tree", "HEAD"], env);
      if (paths.length > 0) {
        writeFileSync(pathspecFile, `${paths.join("\0")}\0`, "utf8");
        await git(
          root,
          [
            "add",
            "--all",
            `--pathspec-from-file=${pathspecFile}`,
            "--pathspec-file-nul",
          ],
          env,
        );
      }
      const tree = await git(root, ["write-tree"], env);
      const head = await git(root, ["rev-parse", "HEAD"], env);
      const revision = await git(
        root,
        [
          "commit-tree",
          tree,
          "-p",
          head,
          "-m",
          `Doolittle checkpoint: ${safeLabel}`,
        ],
        env,
      );
      await git(root, ["update-ref", checkpointRef(id), revision]);
      return {
        id,
        revision,
        label: safeLabel,
        createdAt: new Date().toISOString(),
      };
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async restore(id: string): Promise<WorkspaceCheckpoint> {
    const support = await this.support();
    if (!support.supported) throw new Error(support.reason);
    const checkpoint = (await this.list()).find(
      (candidate) => candidate.id === id,
    );
    if (!checkpoint) throw new Error("Checkpoint not found.");
    await this.create(`Before restoring: ${checkpoint.label}`);
    // Deliberately no reset or checkout: this restores the checkpoint tree into
    // the existing worktree and index after the route has required confirmation.
    // The safety checkpoint above keeps the overwritten state recoverable.
    await git(this.workspaceRoot(), [
      "restore",
      "--source",
      checkpointRef(id),
      "--staged",
      "--worktree",
      "--",
      ".",
    ]);
    return checkpoint;
  }
}
