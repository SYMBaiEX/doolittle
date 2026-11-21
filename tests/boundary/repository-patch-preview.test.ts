import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { captureHostExecutionBaseline } from "@elizaos/host";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RepositoryProcessRunner } from "../../packages/agent/src/services/repository/mutations";
import { RepositoryService } from "../../packages/agent/src/services/repository-service";

const exec = promisify(execFile);
const previewLimit = 240_000;
let workspace: string;

function git(...args: string[]) {
  return exec(
    "git",
    [
      "-c",
      "user.name=Doolittle Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd: workspace, maxBuffer: 16 * 1024 * 1024 },
  );
}

beforeEach(async () => {
  vi.stubEnv("ELIZA_RUNTIME_MODE", "local-yolo");
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  vi.stubEnv(
    "GIT_CONFIG_GLOBAL",
    process.platform === "win32" ? "NUL" : "/dev/null",
  );
  captureHostExecutionBaseline();
  workspace = await mkdtemp(join(tmpdir(), "doolittle-git-preview-"));
  await git("init", "-b", "main");
  await writeFile(join(workspace, "notes with spaces.txt"), "original\n");
  await git("add", ".");
  await git("commit", "-m", "Initial");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(workspace, { recursive: true, force: true });
});

it("preserves complete staged and unstaged previews and enforces repository-relative paths", async () => {
  const path = "notes with spaces.txt";
  await writeFile(join(workspace, path), "staged café\n");
  await git("add", "--", path);
  await writeFile(join(workspace, path), "worktree 日本語 🐈\n");
  const repository = new RepositoryService(workspace);
  const sharedArgs = ["diff", "--no-ext-diff", "--unified=3"];

  for (const staged of [false, true]) {
    const command = [
      ...sharedArgs,
      ...(staged ? ["--cached"] : []),
      "--",
      path,
    ];
    const { stdout } = await git(...command);
    await expect(repository.patch(path, staged)).resolves.toEqual({
      path,
      staged,
      patch: stdout.replace(/\r?\n$/u, ""),
      truncated: false,
    });
  }
  await expect(repository.patch("../outside.txt")).rejects.toThrow();
});

it.skipIf(process.platform === "win32")(
  "returns the exact Unicode prefix of a Git patch larger than the SDK stdio ceiling",
  async () => {
    const path = "notes with spaces.txt";
    await writeFile(
      join(workspace, path),
      `Unicode change: 日本語 🐈 ${"x".repeat(76)}\n`.repeat(100_000),
    );
    const { stdout } = await git("diff", "--no-ext-diff", "--unified=3");
    expect(Buffer.byteLength(stdout)).toBeGreaterThan(8 * 1024 * 1024);
    const repository = new RepositoryService(workspace);
    const [first, joined] = await Promise.all([
      repository.patch(),
      repository.patch(),
    ]);
    expect(first).toEqual({
      path: undefined,
      staged: false,
      patch: stdout.slice(0, previewLimit),
      truncated: true,
    });
    expect(joined).toEqual(first);
    await expect(repository.patch()).resolves.toEqual(first);
  },
);

it("surfaces Git errors even after enough output has arrived to clip the preview", async () => {
  const stdout = "a".repeat(previewLimit + 3);
  const runner = vi.fn<RepositoryProcessRunner>(
    async (_command, _args, options) => {
      options.onStdout?.(stdout);
      return {
        exitCode: options.abortSignal?.aborted ? 130 : 128,
        stdout,
        stderr: "fatal: unreadable Git index",
        durationMs: 0,
        sandbox: "host",
      };
    },
  );
  const repository = new RepositoryService(workspace, runner);
  await expect(repository.patch()).rejects.toThrow(
    "fatal: unreadable Git index",
  );
  await expect(repository.patch()).rejects.toThrow(
    "fatal: unreadable Git index",
  );
  expect(runner).toHaveBeenCalledTimes(2);
});

it("lets a patch with Git warnings finish and preserves the trailing CRLF limit", async () => {
  const stderr = "warning: fixture diagnostic";
  const runner = vi.fn<RepositoryProcessRunner>(
    async (_command, args, options) => {
      const content =
        "é".repeat(previewLimit) + (args.includes("--cached") ? "b" : "");
      const stdout = `${content}\r\n`;
      options.onStderr?.(stderr);
      options.onStdout?.(stdout);
      expect(options.abortSignal?.aborted ?? false).toBe(false);
      return { exitCode: 0, stdout, stderr, durationMs: 0, sandbox: "host" };
    },
  );
  const repository = new RepositoryService(workspace, runner);
  await expect(repository.patch()).resolves.toMatchObject({
    patch: "é".repeat(previewLimit),
    truncated: false,
  });
  await expect(repository.patch(undefined, true)).resolves.toMatchObject({
    patch: "é".repeat(previewLimit),
    truncated: true,
  });
});
