import { describe, expect, it } from "vitest";
import {
  buildCodingIterationFromActionResults,
  extractLocalMutationFromActionResult,
  extractLocalMutationsFromActionResult,
  extractVerifiedLocalMutationFromActionResult,
  summarizeActionResults,
} from "./action-result-metadata";

describe("action result metadata helpers", () => {
  it("extracts local mutations and SDK coding iteration records", () => {
    const actionResults = [
      {
        success: true,
        text: "Wrote: /Users/developer/dev/example-app/index.html",
        data: {
          actionName: "WRITE_FILE",
          mutationKind: "local-file",
          mutation: {
            action: "WRITE_FILE",
            requestedPath: "developer/dev/example-app/index.html",
            resolvedPath: "/Users/developer/dev/example-app/index.html",
            success: true,
            bytes: 42,
          },
          fileOperation: {
            type: "write",
            target: "developer/dev/example-app/index.html",
            size: 42,
          },
        },
      },
      {
        success: false,
        text: "Shell command completed: `bun test`",
        data: {
          actionName: "SHELL_COMMAND",
          command: "bun test",
          exitCode: 1,
          stdout: "",
          stderr: "failed",
          cwd: "/Users/developer/dev/project",
        },
      },
    ];

    expect(extractLocalMutationFromActionResult(actionResults[0])).toEqual({
      action: "WRITE_FILE",
      requestedPath: "developer/dev/example-app/index.html",
      resolvedPath: "/Users/developer/dev/example-app/index.html",
      success: true,
      message: "Wrote: /Users/developer/dev/example-app/index.html",
      bytes: 42,
      replacements: undefined,
    });

    const summary = summarizeActionResults(actionResults);
    expect(summary.observedActionCount).toBe(2);
    expect(summary.localMutations).toHaveLength(1);
    expect(summary.fileOperations).toEqual([
      {
        type: "write",
        target: "developer/dev/example-app/index.html",
        size: 42,
      },
    ]);
    expect(summary.commandResults).toEqual([
      {
        command: "bun test",
        exitCode: 1,
        stdout: "",
        stderr: "failed",
        executedIn: "/Users/developer/dev/project",
        durationMs: undefined,
        success: false,
      },
    ]);

    const iteration = buildCodingIterationFromActionResults(actionResults);
    expect(iteration).toMatchObject({
      index: 0,
      fileOperations: summary.fileOperations,
      commandResults: summary.commandResults,
      errors: [
        {
          category: "other",
          message: "Shell command completed: `bun test`",
          raw: "Shell command completed: `bun test`",
        },
      ],
    });
    expect(iteration?.completedAt).toBeGreaterThan(0);
  });

  it("does not treat contradictory mutation metadata as a successful receipt", () => {
    const actionResult = {
      success: false,
      data: {
        actionName: "WRITE_FILE",
        mutationKind: "local-file",
        mutation: { action: "WRITE_FILE", success: true },
      },
    };

    expect(extractLocalMutationFromActionResult(actionResult)).toMatchObject({
      success: true,
    });
    expect(
      extractVerifiedLocalMutationFromActionResult(actionResult),
    ).toBeUndefined();
  });

  it("projects every fingerprint-verified delegated file into the run receipt", () => {
    const result = {
      success: true,
      data: {
        actionName: "TASKS_SPAWN_AGENT",
        delegatedExecution: {
          workdir: "/workspace/project",
          status: "completed",
          verifiedLocalMutation: true,
          changedFiles: [
            { path: "src/app/page.tsx", bytes: 128 },
            { path: "/workspace/project/package.json", bytes: 64 },
          ],
        },
      },
    };

    expect(extractLocalMutationsFromActionResult(result)).toEqual([
      {
        action: "TASKS_SPAWN_AGENT",
        requestedPath: "/workspace/project",
        resolvedPath: "/workspace/project/src/app/page.tsx",
        success: true,
        bytes: 128,
        message:
          "Verified delegated file change with before/after SHA-256 fingerprints.",
      },
      {
        action: "TASKS_SPAWN_AGENT",
        requestedPath: "/workspace/project",
        resolvedPath: "/workspace/project/package.json",
        success: true,
        bytes: 64,
        message:
          "Verified delegated file change with before/after SHA-256 fingerprints.",
      },
    ]);
    expect(summarizeActionResults([result]).localMutations).toHaveLength(2);
  });

  it("preserves official SHELL results without inventing a working directory", () => {
    const summary = summarizeActionResults([
      {
        success: true,
        text: "Shell command completed: `pwd`",
        data: {
          actionName: "SHELL",
          command: "pwd",
          exitCode: 0,
          stdout: "/workspace\n",
          stderr: "",
        },
      },
    ]);

    expect(summary.commandResults).toEqual([
      {
        command: "pwd",
        exitCode: 0,
        stdout: "/workspace",
        stderr: "",
        durationMs: undefined,
        success: true,
      },
    ]);
  });

  it("treats non-zero SDK SHELL exits as failed command receipts", () => {
    const summary = summarizeActionResults([
      {
        success: true,
        text: "Shell command completed: `bun run build`",
        data: {
          actionName: "SHELL",
          command: "bun run build",
          exitCode: 1,
          stderr: "Build failed",
        },
      },
    ]);

    expect(summary.commandResults).toMatchObject([
      { command: "bun run build", exitCode: 1, success: false },
    ]);
  });
});
