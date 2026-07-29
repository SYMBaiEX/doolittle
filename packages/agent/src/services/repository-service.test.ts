import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RepositoryService } from "./repository-service";

const createdDirectories: string[] = [];

function runGit(cwd: string, args: string[]): void {
  const process = spawnSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (process.status !== 0) {
    throw new Error(process.stderr.toString("utf8"));
  }
}

function createRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-repository-"));
  createdDirectories.push(directory);
  runGit(directory, ["init", "-q"]);
  runGit(directory, ["config", "user.name", "Doolittle Test"]);
  runGit(directory, ["config", "user.email", "test@doolittle.local"]);
  writeFileSync(join(directory, "tracked.txt"), "before\n", "utf8");
  runGit(directory, ["add", "tracked.txt"]);
  runGit(directory, ["commit", "-qm", "initial"]);
  return directory;
}

afterEach(() => {
  while (createdDirectories.length) {
    const directory = createdDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("RepositoryService review model", () => {
  it("keeps one service instance while the live repository root changes", async () => {
    const first = createRepository();
    const second = createRepository();
    let workspaceDir = first;
    const repository = new RepositoryService(() => workspaceDir);

    expect((await repository.summary()).root).toBe(first);
    workspaceDir = second;
    repository.invalidateWorkspace();
    expect((await repository.summary()).root).toBe(second);
  });

  it("reports branch state, changed files, patches, and worktrees", async () => {
    const directory = createRepository();
    writeFileSync(join(directory, "tracked.txt"), "after\n", "utf8");
    writeFileSync(join(directory, "new file.txt"), "new\n", "utf8");
    const repository = new RepositoryService(directory);

    const summary = await repository.summary();
    const changes = await repository.changes();
    const patch = await repository.patch("tracked.txt");
    const worktrees = await repository.worktrees();

    expect(summary.isRepository).toBe(true);
    expect(summary.dirty).toBe(true);
    expect(summary.changedFiles).toBe(2);
    expect(changes.map((change) => change.path)).toContain("tracked.txt");
    expect(changes.map((change) => change.path)).toContain("new file.txt");
    expect(patch.patch).toContain("-before");
    expect(patch.patch).toContain("+after");
    expect(patch.truncated).toBe(false);
    expect(worktrees).toHaveLength(1);
    expect(worktrees[0]?.path).toBe(realpathSync(directory));
  });

  it("keeps requested patches inside the configured workspace", async () => {
    const directory = createRepository();
    const repository = new RepositoryService(directory);

    await expect(repository.patch("../outside.txt")).rejects.toThrow(
      "Path must stay inside the configured workspace",
    );
  });

  it("creates a new branch in a contained, non-existent worktree path", async () => {
    const directory = createRepository();
    const repository = new RepositoryService(directory);

    const worktree = await repository.createWorktree({
      branch: "feature/contained-worktree",
      path: ".worktrees/contained-worktree",
    });

    expect(worktree.branch).toBe("feature/contained-worktree");
    expect(worktree.path).toBe(
      realpathSync(join(directory, ".worktrees/contained-worktree")),
    );
    expect(existsSync(join(worktree.path, "tracked.txt"))).toBe(true);
    expect((await repository.worktrees()).map((entry) => entry.path)).toContain(
      worktree.path,
    );
  });

  it("accepts only the canonical path of an active listed worktree", async () => {
    const directory = createRepository();
    const repository = new RepositoryService(directory);
    const worktree = await repository.createWorktree({
      branch: "feature/execution-root",
      path: ".worktrees/execution-root",
    });
    const alias = join(directory, "worktree-alias");
    symlinkSync(worktree.path, alias);
    const unrelated = mkdtempSync(join(tmpdir(), "doolittle-unrelated-"));
    createdDirectories.push(unrelated);

    await expect(repository.resolveWorktreeRoot(worktree.path)).resolves.toBe(
      worktree.path,
    );
    await expect(repository.resolveWorktreeRoot(alias)).rejects.toThrow(
      "canonical real path",
    );
    await expect(
      repository.resolveWorktreeRoot(realpathSync(unrelated)),
    ).rejects.toThrow("active Git worktree");
    await expect(
      repository.resolveWorktreeRoot(join(directory, "missing-worktree")),
    ).rejects.toThrow("does not exist");
  });

  it("bypasses cached worktree listings when validating an execution root", async () => {
    const directory = createRepository();
    const repository = new RepositoryService(directory);
    const worktree = await repository.createWorktree({
      branch: "feature/removed-execution-root",
      path: ".worktrees/removed-execution-root",
    });

    await repository.worktrees();
    runGit(directory, ["worktree", "remove", "--force", worktree.path]);
    mkdirSync(worktree.path, { recursive: true });

    await expect(repository.resolveWorktreeRoot(worktree.path)).rejects.toThrow(
      "active Git worktree",
    );
  });

  it("rejects unsafe branches, traversal, existing paths, and symlink escapes", async () => {
    const directory = createRepository();
    const outside = mkdtempSync(join(tmpdir(), "doolittle-worktree-outside-"));
    createdDirectories.push(outside);
    symlinkSync(outside, join(directory, "linked-outside"));
    const repository = new RepositoryService(directory);

    await expect(
      repository.createWorktree({
        branch: "--detach",
        path: ".worktrees/invalid-branch",
      }),
    ).rejects.toThrow("not a valid Git branch");
    await expect(
      repository.createWorktree({
        branch: "feature/traversal",
        path: "../outside",
      }),
    ).rejects.toThrow(/unsafe traversal|configured workspace/u);
    await expect(
      repository.createWorktree({
        branch: "feature/existing",
        path: "tracked.txt",
      }),
    ).rejects.toThrow("already exists");
    await expect(
      repository.createWorktree({
        branch: "feature/symlink-escape",
        path: "linked-outside/worktree",
      }),
    ).rejects.toThrow("configured workspace");
  });

  it("stages, unstages, commits, discards, and exposes repository control state", async () => {
    const directory = createRepository();
    writeFileSync(join(directory, "tracked.txt"), "changed\n", "utf8");
    const repository = new RepositoryService(directory);

    expect(
      (await repository.mutate({ type: "stage", paths: ["tracked.txt"] })).ok,
    ).toBe(true);
    expect(
      (await repository.changes()).find(
        (change) => change.path === "tracked.txt",
      )?.staged,
    ).toBe(true);
    expect(
      (await repository.mutate({ type: "unstage", paths: ["tracked.txt"] })).ok,
    ).toBe(true);
    expect((await repository.mutate({ type: "stage-all" })).ok).toBe(true);
    expect(
      (await repository.mutate({ type: "commit", message: "save changes" })).ok,
    ).toBe(true);
    expect(await repository.recentCommits()).toContain("save changes");

    writeFileSync(join(directory, "tracked.txt"), "discard me\n", "utf8");
    writeFileSync(join(directory, "untracked.txt"), "new\n", "utf8");
    expect(
      (await repository.mutate({ type: "discard", paths: ["tracked.txt"] })).ok,
    ).toBe(true);
    expect(
      (
        await repository.mutate({
          type: "discard-untracked",
          paths: ["untracked.txt"],
        })
      ).ok,
    ).toBe(true);
    expect(existsSync(join(directory, "untracked.txt"))).toBe(false);

    expect(
      (
        await repository.mutate({
          type: "branch-create",
          branch: "feature/control",
          checkout: false,
        })
      ).ok,
    ).toBe(true);
    expect(
      (await repository.branches()).map((branch) => branch.name),
    ).toContain("feature/control");
    expect(await repository.remotes()).toEqual([]);
    expect(await repository.stashes()).toEqual([]);
    expect(await repository.conflicts()).toEqual([]);
  });

  it("returns structured Git failures while rejecting unsafe mutations before execution", async () => {
    const directory = createRepository();
    const repository = new RepositoryService(directory);

    const failed = await repository.mutate({
      type: "branch-delete",
      branch: "missing-branch",
    });
    expect(failed).toMatchObject({
      type: "branch-delete",
      ok: false,
      exitCode: expect.any(Number),
      error: expect.any(String),
    });
    await expect(
      repository.mutate({ type: "stage", paths: ["../outside.txt"] }),
    ).rejects.toThrow("configured workspace");
    await expect(
      repository.mutate({ type: "stage-hunk", patch: "@@ -1 +1 @@\n-a\n+b\n" }),
    ).rejects.toThrow("standard unified text diff");
  });

  it("applies selected text hunks without routing patch content through a shell", async () => {
    const directory = createRepository();
    const repository = new RepositoryService(directory);
    writeFileSync(join(directory, "tracked.txt"), "after\n", "utf8");

    const unstagedPatch = await repository.patch("tracked.txt");
    expect(
      (
        await repository.mutate({
          type: "stage-hunk",
          patch: unstagedPatch.patch,
        })
      ).ok,
    ).toBe(true);
    expect((await repository.changes())[0]?.staged).toBe(true);

    const stagedPatch = await repository.patch("tracked.txt", true);
    expect(
      (
        await repository.mutate({
          type: "unstage-hunk",
          patch: stagedPatch.patch,
        })
      ).ok,
    ).toBe(true);
    expect((await repository.changes())[0]?.unstaged).toBe(true);
    expect(readFileSync(join(directory, "tracked.txt"), "utf8")).toBe(
      "after\n",
    );

    const discardPatch = await repository.patch("tracked.txt");
    expect(
      (
        await repository.mutate({
          type: "discard-hunk",
          patch: discardPatch.patch,
        })
      ).ok,
    ).toBe(true);
    expect(await repository.changes()).toEqual([]);
    await expect(
      repository.mutate({
        type: "stage-hunk",
        patch: "diff --git a/../outside b/../outside\n@@ -1 +1 @@\n-a\n+b\n",
      }),
    ).rejects.toThrow("configured workspace");
  });

  it("controls worktrees, remotes, and stashes through typed Git mutations", async () => {
    const directory = createRepository();
    const repository = new RepositoryService(directory);
    const worktree = await repository.createWorktree({
      branch: "feature/removable-worktree",
      path: ".worktrees/removable-worktree",
    });

    expect(
      (
        await repository.mutate({
          type: "worktree-remove",
          path: worktree.path,
        })
      ).ok,
    ).toBe(true);
    expect(existsSync(worktree.path)).toBe(false);
    expect((await repository.mutate({ type: "worktree-prune" })).ok).toBe(true);

    expect(
      (
        await repository.mutate({
          type: "remote-add",
          name: "test-remote",
          url: "https://example.com/test.git",
        })
      ).ok,
    ).toBe(true);
    expect(
      (await repository.remotes()).find(
        (remote) => remote.name === "test-remote",
      )?.fetchUrl,
    ).toBe("https://example.com/test.git");
    expect(
      (
        await repository.mutate({
          type: "remote-set-url",
          name: "test-remote",
          url: "https://example.com/updated.git",
        })
      ).ok,
    ).toBe(true);
    expect(
      (await repository.mutate({ type: "remote-remove", name: "test-remote" }))
        .ok,
    ).toBe(true);

    writeFileSync(join(directory, "tracked.txt"), "stash me\n", "utf8");
    expect(
      (await repository.mutate({ type: "stash-create", message: "save local" }))
        .ok,
    ).toBe(true);
    const stash = (await repository.stashes())[0];
    expect(stash?.reference).toBe("stash@{0}");
    expect(
      (
        await repository.mutate({
          type: "stash-apply",
          reference: stash?.reference ?? "stash@{0}",
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await repository.mutate({
          type: "stash-drop",
          reference: stash?.reference ?? "stash@{0}",
        })
      ).ok,
    ).toBe(true);
  });
});
