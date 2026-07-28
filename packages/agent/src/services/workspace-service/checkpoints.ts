import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

function git(root: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env,
  }).trim();
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

function repositoryRoot(root: string): string | null {
  try {
    return git(root, ["rev-parse", "--show-toplevel"]);
  } catch {
    return null;
  }
}

/**
 * Git-backed snapshots that never alter the caller's worktree or index while
 * being created. The checkpoint ref points to a commit built from a temporary
 * index, including untracked (but not ignored) project files.
 */
export class WorkspaceCheckpointService {
  constructor(private readonly workspaceRoot: () => string) {}

  support(): WorkspaceCheckpointSupport {
    const root = this.workspaceRoot();
    const repository = repositoryRoot(root);
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
      git(root, ["rev-parse", "--verify", "HEAD"]);
    } catch {
      return {
        supported: false,
        reason: "Checkpoints require an initial Git commit.",
      };
    }
    return { supported: true };
  }

  list(): WorkspaceCheckpoint[] {
    const support = this.support();
    if (!support.supported) return [];
    const root = this.workspaceRoot();
    const format =
      "%(refname:strip=3)%00%(objectname)%00%(committerdate:iso-strict)%00%(subject)";
    const output = git(root, [
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

  create(label?: string): WorkspaceCheckpoint {
    const support = this.support();
    if (!support.supported) throw new Error(support.reason);
    const root = this.workspaceRoot();
    const id = checkpointId();
    const safeLabel = cleanLabel(label);
    const temporaryDirectory = mkdtempSync(
      join(tmpdir(), "doolittle-checkpoint-"),
    );
    const temporaryIndex = join(temporaryDirectory, "index");
    const env = {
      ...process.env,
      ...GIT_IDENTITY,
      GIT_INDEX_FILE: temporaryIndex,
    };
    try {
      git(root, ["read-tree", "HEAD"], env);
      git(root, ["add", "--all"], env);
      const tree = git(root, ["write-tree"], env);
      const head = git(root, ["rev-parse", "HEAD"], env);
      const revision = git(
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
      git(root, ["update-ref", checkpointRef(id), revision]);
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

  restore(id: string): WorkspaceCheckpoint {
    const support = this.support();
    if (!support.supported) throw new Error(support.reason);
    const checkpoint = this.list().find((candidate) => candidate.id === id);
    if (!checkpoint) throw new Error("Checkpoint not found.");
    // Deliberately no reset or checkout: this restores the checkpoint tree into
    // the existing worktree and index after the route has required confirmation.
    git(this.workspaceRoot(), [
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
