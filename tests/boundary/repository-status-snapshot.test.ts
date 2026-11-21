import { execFile } from "node:child_process";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it, vi } from "vitest";
import type { RepositoryProcessRunner } from "../../packages/agent/src/services/repository/mutations";
import { RepositoryService } from "../../packages/agent/src/services/repository-service";

const exec = promisify(execFile);
const gitConfig = [
  "-c",
  "user.name=Doolittle Fixture",
  "-c",
  "user.email=fixture@example.invalid",
  "-c",
  "commit.gpgsign=false",
];

it("shares a Git status for concurrent workspace reads and preserves branch and path details", async () => {
  const workspace = await mkdtemp(
    join(tmpdir(), "doolittle-repository-status-"),
  );
  const git = async (...args: readonly string[]) =>
    exec("git", [...gitConfig, ...args], {
      cwd: workspace,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      },
    });
  const runner = vi.fn<RepositoryProcessRunner>(async (command, args) => {
    expect(command).toBe("git");
    try {
      return {
        ...(await git(...args)),
        exitCode: 0,
        durationMs: 0,
        sandbox: "none",
      };
    } catch (error) {
      if (error instanceof Error && "stderr" in error) {
        return {
          stdout: "",
          stderr: String(error.stderr),
          exitCode: 1,
          durationMs: 0,
          sandbox: "none",
        };
      }
      throw error;
    }
  });
  const service = new RepositoryService(workspace, runner);
  try {
    await git("init", "-b", "main");
    expect(await service.summary()).toMatchObject({
      branch: "main",
      head: undefined,
      upstream: undefined,
      changedFiles: 0,
    });

    await writeFile(join(workspace, "original name.txt"), "original\n");
    await git("add", ".");
    await git("commit", "-m", "Initial");
    await git("switch", "-c", "upstream");
    await git("commit", "--allow-empty", "-m", "Upstream change");
    await git("switch", "main");
    await git("commit", "--allow-empty", "-m", "Local change");
    await git("branch", "--set-upstream-to=upstream", "main");
    await git("mv", "original name.txt", "new name.txt");
    await appendFile(join(workspace, "new name.txt"), "unstaged\n");
    await writeFile(join(workspace, "remaining file.txt"), "untracked\n");
    const head = (await git("rev-parse", "--short", "HEAD")).stdout.trim();
    service.invalidateWorkspace();
    runner.mockClear();

    const [summary, changes] = await Promise.all([
      service.summary(),
      service.changes(),
    ]);
    expect(summary).toMatchObject({
      branch: "main",
      head,
      upstream: "upstream",
      ahead: 1,
      behind: 1,
      dirty: true,
      changedFiles: 2,
    });
    expect(changes).toEqual([
      {
        path: "new name.txt",
        previousPath: "original name.txt",
        indexStatus: "R",
        worktreeStatus: "M",
        staged: true,
        unstaged: true,
        untracked: false,
      },
      {
        path: "remaining file.txt",
        indexStatus: "?",
        worktreeStatus: "?",
        staged: false,
        unstaged: true,
        untracked: true,
      },
    ]);
    expect(runner).toHaveBeenCalledTimes(2);

    await git("switch", "--detach");
    service.invalidateWorkspace();
    expect(await service.summary()).toMatchObject({
      branch: undefined,
      head,
      upstream: undefined,
      ahead: 0,
      behind: 0,
    });

    await git("switch", "-c", "(detached)");
    service.invalidateWorkspace();
    expect(await service.summary()).toMatchObject({ branch: "(detached)" });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
