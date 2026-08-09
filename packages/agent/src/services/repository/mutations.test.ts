import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RepositoryMutationExecutor } from "./mutations";

const roots: string[] = [];

function processResult(stdout = "", stderr = "", exitCode = 0) {
  return { stdout, stderr, exitCode, durationMs: 0, sandbox: "none" as const };
}

function createExecutor(
  runner: ConstructorParameters<typeof RepositoryMutationExecutor>[0]["runner"],
) {
  const root = mkdtempSync(join(tmpdir(), "doolittle-mutations-"));
  roots.push(root);
  mkdirSync(join(root, ".git"));
  let invalidations = 0;
  return {
    root,
    invalidations: () => invalidations,
    executor: new RepositoryMutationExecutor({
      root,
      workspaceRoot: () => root,
      runner,
      invalidateCache: () => {
        invalidations += 1;
      },
      worktrees: async () => [],
      conflicts: async () => [],
    }),
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("RepositoryMutationExecutor", () => {
  it("plans and executes safe Git path mutations with the repository tool name", async () => {
    const calls: Array<{
      command: string;
      args: readonly string[];
      toolName: string;
    }> = [];
    const { executor, invalidations } = createExecutor(
      async (command, args, options) => {
        calls.push({ command, args, toolName: options.toolName });
        return processResult();
      },
    );

    await expect(
      executor.execute({ type: "stage", paths: ["src/app.ts"] }),
    ).resolves.toMatchObject({ ok: true, summary: "Staged selected files" });
    expect(calls).toEqual([
      {
        command: "git",
        args: ["add", "--", "src/app.ts"],
        toolName: "doolittle.repository.stage",
      },
    ]);
    expect(invalidations()).toBe(1);
  });

  it("uses a private temporary patch file and removes it after execution", async () => {
    let patchFile = "";
    const { executor, invalidations } = createExecutor(
      async (_command, args) => {
        const candidate = args.at(-1);
        if (!candidate)
          throw new Error("Patch file argument was not supplied.");
        patchFile = candidate;
        expect(existsSync(patchFile)).toBe(true);
        return processResult("applied\n");
      },
    );
    const patch =
      "diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-before\n+after\n";

    await expect(
      executor.execute({ type: "stage-hunk", patch }),
    ).resolves.toMatchObject({ ok: true, stdout: "applied" });
    expect(basename(patchFile)).toBe("selection.patch");
    expect(existsSync(patchFile)).toBe(false);
    expect(invalidations()).toBe(1);
  });

  it("rejects operation continuations unless their Git state marker exists", async () => {
    let ran = false;
    const { executor } = createExecutor(async () => {
      ran = true;
      return processResult();
    });

    await expect(executor.execute({ type: "merge-abort" })).rejects.toThrow(
      "There is no merge in progress.",
    );
    expect(ran).toBe(false);
  });

  it("plans GitHub pull request commands through the injected runner", async () => {
    const calls: Array<{
      command: string;
      args: readonly string[];
      toolName: string;
    }> = [];
    const { executor } = createExecutor(async (command, args, options) => {
      calls.push({ command, args, toolName: options.toolName });
      return processResult("https://example.test/pr/1\n");
    });

    await expect(
      executor.execute({
        type: "pr-create",
        title: "Mutation extraction",
        body: "Keeps execution isolated.",
        base: "main",
        draft: true,
      }),
    ).resolves.toMatchObject({ ok: true, summary: "Created pull request" });
    expect(calls).toEqual([
      {
        command: "gh",
        args: [
          "pr",
          "create",
          "--title",
          "Mutation extraction",
          "--body",
          "Keeps execution isolated.",
          "--base",
          "main",
          "--draft",
        ],
        toolName: "doolittle.repository.pr-create",
      },
    ]);
  });
});
