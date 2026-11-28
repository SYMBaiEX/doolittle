import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { RepositoryProcessRunner } from "../../packages/agent/src/services/repository/mutations";
import { RepositoryService } from "../../packages/agent/src/services/repository-service";

const exec = promisify(execFile);
const fixturePath = "f.txt";
const originalContent = `${Array.from(
  { length: 80 },
  (_, index) => `line ${index + 1}`,
).join("\n")}\n`;

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
    { cwd: workspace, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}

function processOutput(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const runner: RepositoryProcessRunner = async (command, args, options) => {
  const started = Date.now();
  try {
    const { stdout, stderr } = await exec(command, [...args], {
      cwd: options.cwd,
      encoding: "utf8",
      env: { ...process.env, ...options.env },
      maxBuffer: 16 * 1024 * 1024,
    });
    return {
      exitCode: 0,
      stdout,
      stderr,
      durationMs: Date.now() - started,
      sandbox: "host",
    };
  } catch (cause) {
    const failure = cause as {
      code?: unknown;
      stdout?: unknown;
      stderr?: unknown;
    };
    if (typeof failure.code === "number") {
      return {
        exitCode: failure.code,
        stdout: processOutput(failure.stdout),
        stderr: processOutput(failure.stderr),
        durationMs: Date.now() - started,
        sandbox: "host",
      };
    }
    throw cause;
  }
};

/** Test-only extraction mirroring the subset patches produced by review UI. */
function selectHunks(patch: string, selected: readonly number[]): string {
  const wanted = new Set(selected);
  const output: string[] = [];
  let hunkIndex = -1;
  let include = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@ ")) {
      hunkIndex += 1;
      include = wanted.has(hunkIndex);
    }
    if (hunkIndex < 0 || include) output.push(line);
  }
  return `${output.join("\n")}\n`;
}

async function writeShiftedChange() {
  const lines = originalContent.trimEnd().split("\n");
  const inserted: string[] = [];
  for (const [index, line] of lines.entries()) {
    inserted.push(line);
    if (index + 1 === 5) {
      inserted.push("inserted a", "inserted b", "inserted c", "inserted d");
    }
  }
  await writeFile(
    join(workspace, fixturePath),
    `${inserted.join("\n")}\n`
      .replace("line 35\n", "line thirty-five\n")
      .replace("line 65\n", ""),
  );
}

async function indexContent() {
  return (await git("show", `:${fixturePath}`)).stdout;
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "doolittle-hunk-apply-"));
  await git("init", "-b", "main");
  await writeFile(join(workspace, fixturePath), originalContent);
  await git("add", "--", fixturePath);
  await git("commit", "-m", "Initial");
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

it("stages a non-contiguous hunk subset while recomputing shifted offsets", async () => {
  await writeShiftedChange();
  const repository = new RepositoryService(workspace, runner);
  const { patch } = await repository.patch(fixturePath);
  expect(patch.match(/^@@ /gmu)).toHaveLength(3);

  const subset = selectHunks(patch, [0, 2]);
  const result = await repository.mutate({ type: "stage-hunk", patch: subset });

  expect(result).toMatchObject({ ok: true, exitCode: 0 });
  const staged = await indexContent();
  expect(staged).toContain("inserted a\n");
  expect(staged).not.toContain("line 65\n");
  expect(staged).toContain("line 35\n");
  expect(staged).not.toContain("line thirty-five\n");

  const worktree = await readFile(join(workspace, fixturePath), "utf8");
  expect(worktree).toContain("line thirty-five\n");
});

it("unstages only the selected hunk from a staged patch", async () => {
  await writeShiftedChange();
  await git("add", "--", fixturePath);
  const repository = new RepositoryService(workspace, runner);
  const { patch } = await repository.patch(fixturePath, true);
  expect(patch.match(/^@@ /gmu)).toHaveLength(3);

  const subset = selectHunks(patch, [1]);
  const result = await repository.mutate({
    type: "unstage-hunk",
    patch: subset,
  });

  expect(result).toMatchObject({ ok: true, exitCode: 0 });
  const staged = await indexContent();
  expect(staged).toContain("inserted a\n");
  expect(staged).not.toContain("line 65\n");
  expect(staged).toContain("line 35\n");
  expect(staged).not.toContain("line thirty-five\n");
});

it("discards only the selected working-tree hunk", async () => {
  await writeShiftedChange();
  const repository = new RepositoryService(workspace, runner);
  const { patch } = await repository.patch(fixturePath);

  const subset = selectHunks(patch, [1]);
  const result = await repository.mutate({
    type: "discard-hunk",
    patch: subset,
  });

  expect(result).toMatchObject({ ok: true, exitCode: 0 });
  const worktree = await readFile(join(workspace, fixturePath), "utf8");
  expect(worktree).toContain("inserted a\n");
  expect(worktree).not.toContain("line 65\n");
  expect(worktree).toContain("line 35\n");
  expect(worktree).not.toContain("line thirty-five\n");

  const staged = await indexContent();
  expect(staged).toBe(originalContent);
});

it("rejects overlapping context-dependent hunks atomically", async () => {
  const overlapping = [
    "diff --git a/f.txt b/f.txt",
    "index 1111111..2222222 100644",
    "--- a/f.txt",
    "+++ b/f.txt",
    "@@ -1,4 +1,4 @@",
    " line 1",
    "-line 2",
    "+line two",
    " line 3",
    " line 4",
    "@@ -2,4 +2,4 @@",
    " line 2",
    "-line 3",
    "+line three",
    " line 4",
    " line 5",
    "",
  ].join("\n");
  const repository = new RepositoryService(workspace, runner);

  const result = await repository.mutate({
    type: "stage-hunk",
    patch: overlapping,
  });

  expect(result.ok).toBe(false);
  expect(result.error).toContain("patch does not apply");
  expect(await indexContent()).toBe(originalContent);
});
