import { execFile, execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify, stripVTControlCharacters } from "node:util";
import { expect } from "@playwright/test";
import { isolatedRuntimeEnvironment } from "./isolated-runtime-environment";

const execute = promisify(execFile);
const targets = [
  {
    path: "tests/boundary/chat-page-attachments.test.tsx",
    helper: "deferred",
    call: /\bdeferred</gu,
    replacement: "createDeferred<",
  },
  {
    path: "tests/boundary/desktop-search-progress.test.tsx",
    helper: "deferredSearch",
    call: /\bdeferredSearch\(\)/gu,
    replacement: "createDeferred<unknown>()",
  },
  {
    path: "tests/boundary/desktop-session-inventory.test.ts",
    helper: "pending",
    call: /\bpending</gu,
    replacement: "createDeferred<",
  },
] as const;
const sharedImport =
  /^import \{ createDeferred \} from ["']\.\.\/support\/deferred["'];$/mu;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function withoutBlankLines(source: string): string {
  return source
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .join("\n");
}

/** Verify the caller-prepared clone before the installed app can approve it. */
export function prepareMultifileCodingWorkspace(
  repoRoot: string,
  selectedPath: string,
) {
  const workspace = realpathSync(selectedPath);
  const label = relative(realpathSync(tmpdir()), workspace);
  if (
    !isAbsolute(selectedPath) ||
    workspace !== resolve(selectedPath) ||
    !/^doolittle-fresh-workspace-[^/\\]+$/u.test(label) ||
    !lstatSync(join(workspace, ".git"), {
      throwIfNoEntry: false,
    })?.isDirectory()
  ) {
    throw new Error(
      "Use a canonical scratch clone under the system temporary directory.",
    );
  }
  const revision = git(workspace, "rev-parse", "HEAD");
  if (
    git(workspace, "rev-parse", "--show-toplevel") !== workspace ||
    revision !== git(repoRoot, "rev-parse", "HEAD") ||
    git(workspace, "remote") ||
    git(workspace, "status", "--porcelain") ||
    /^S /mu.test(git(workspace, "ls-files", "-t"))
  ) {
    throw new Error(
      "The scratch clone must be clean, match this HEAD, and have no remotes.",
    );
  }
  for (const name of readdirSync(workspace)) {
    if (/^\.env(?:\.|$)/u.test(name) && name !== ".env.example")
      throw new Error("Remove local environment files from the scratch clone.");
  }
  if (
    !lstatSync(join(workspace, "node_modules/vitest/package.json"), {
      throwIfNoEntry: false,
    })
  )
    throw new Error(
      "Install the scratch clone's dependencies before the live test.",
    );

  const expected = targets.map(({ path, helper, call, replacement }) => {
    const source = readFileSync(join(workspace, path), "utf8");
    const definition = new RegExp(
      `^function ${helper}(?:<T>)?\\(\\) \\{\\n[^]*?^\\}\\n`,
      "mu",
    );
    if (
      !definition.test(source) ||
      !source.match(call) ||
      sharedImport.test(source)
    ) {
      throw new Error(
        `The multi-file fixture no longer has the local helper in ${path}.`,
      );
    }
    return {
      path,
      source: withoutBlankLines(
        source.replace(definition, "").replace(call, replacement),
      ),
    };
  });

  return {
    workspace,
    prompt: [
      `Use only the selected local Doolittle checkout at ${workspace}.`,
      "Remove the handwritten deferred promise helpers in these three renderer tests and import createDeferred from ../support/deferred instead.",
      `- ${targets[0].path}: replace deferred<T>() calls with createDeferred<T>().`,
      `- ${targets[1].path}: replace deferredSearch() calls with createDeferred<unknown>().`,
      `- ${targets[2].path}: replace pending<T>() calls with createDeferred<T>().`,
      "Inspect the named files, make only those substitutions, and preserve every test, assertion, mock, and teardown. Do not edit other files or stage or commit anything.",
      "After the edits, run the exact command nub run test in this checkout through the regular terminal tool and report the actual result. The clone already has dependencies.",
    ].join("\n"),
    verify() {
      // The full-suite command cannot be weakened by editing test config or scripts.
      expect(git(workspace, "rev-parse", "HEAD")).toBe(revision);
      const staged = git(workspace, "diff", "--cached", "--name-only");
      const unstaged = git(workspace, "diff", "--name-only").split("\n").sort();
      const untracked = git(
        workspace,
        "ls-files",
        "--others",
        "--exclude-standard",
      );
      expect(staged).toBe("");
      expect(untracked).toBe("");
      expect(unstaged).toEqual(expected.map(({ path }) => path));
      for (const { path, source } of expected) {
        const actual = readFileSync(join(workspace, path), "utf8");
        expect(actual, path).toMatch(sharedImport);
        expect(withoutBlankLines(actual.replace(sharedImport, "")), path).toBe(
          source,
        );
      }
      git(workspace, "diff", "--check");
      return { revision, files: unstaged };
    },
  };
}

export function summarizeVitestOutput(output: string) {
  const readable = stripVTControlCharacters(output);
  const files = readable.match(/^\s*Test Files\s+(\d+) passed\s+\((\d+)\)/mu);
  const tests = readable.match(/^\s*Tests\s+(\d+) passed\s+\((\d+)\)/mu);
  if (!files || !tests || files[1] !== files[2] || tests[1] !== tests[2])
    throw new Error(
      "The full suite did not report every file and test passing.",
    );
  return { files: Number(files[1]), tests: Number(tests[1]) };
}

export async function verifyFullSuite(workspace: string, profile: string) {
  const result = await execute("nub", ["run", "test"], {
    cwd: workspace,
    env: isolatedRuntimeEnvironment(join(profile, "independent-tests")),
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return summarizeVitestOutput(result.stdout);
}

/** Filesystem allocation only; the active database is never opened by the test. */
export function measurePglite(profile: string) {
  function allocatedBytes(directory: string): number {
    try {
      return readdirSync(directory, { withFileTypes: true }).reduce(
        (sum, entry) => {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) return sum + allocatedBytes(path);
          if (!entry.isFile()) return sum;
          const stat = lstatSync(path, { throwIfNoEntry: false });
          if (!stat) return sum; // A WAL segment can be removed while sampling.
          return (
            sum + (stat.blocks === undefined ? stat.size : stat.blocks * 512)
          );
        },
        0,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
      throw error;
    }
  }
  const database = join(profile, "runtime", "pglite");
  return {
    totalBytes: allocatedBytes(database),
    walBytes: allocatedBytes(join(database, "pg_wal")),
  };
}
