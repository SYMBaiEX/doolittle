import { describe, expect, it } from "bun:test";
import {
  buildCodingIterationFromActionResults,
  extractLocalMutationFromActionResult,
  summarizeActionResults,
} from "./action-result-metadata";

describe("action result metadata helpers", () => {
  it("extracts local mutations and SDK coding iteration records", () => {
    const actionResults = [
      {
        success: true,
        text: "Wrote: /Users/symbiex/dev/the-game/index.html",
        data: {
          actionName: "WRITE_FILE",
          mutationKind: "local-file",
          mutation: {
            action: "WRITE_FILE",
            requestedPath: "symbiex/dev/the-game/index.html",
            resolvedPath: "/Users/symbiex/dev/the-game/index.html",
            success: true,
            bytes: 42,
          },
          fileOperation: {
            type: "write",
            target: "symbiex/dev/the-game/index.html",
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
          cwd: "/Users/symbiex/dev/project",
        },
      },
    ];

    expect(extractLocalMutationFromActionResult(actionResults[0])).toEqual({
      action: "WRITE_FILE",
      requestedPath: "symbiex/dev/the-game/index.html",
      resolvedPath: "/Users/symbiex/dev/the-game/index.html",
      success: true,
      message: "Wrote: /Users/symbiex/dev/the-game/index.html",
      bytes: 42,
      replacements: undefined,
    });

    const summary = summarizeActionResults(actionResults);
    expect(summary.observedActionCount).toBe(2);
    expect(summary.localMutations).toHaveLength(1);
    expect(summary.fileOperations).toEqual([
      {
        type: "write",
        target: "symbiex/dev/the-game/index.html",
        size: 42,
      },
    ]);
    expect(summary.commandResults).toEqual([
      {
        command: "bun test",
        exitCode: 1,
        stdout: "",
        stderr: "failed",
        executedIn: "/Users/symbiex/dev/project",
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
});
