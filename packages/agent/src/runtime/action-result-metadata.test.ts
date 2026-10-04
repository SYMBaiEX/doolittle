import { describe, expect, it } from "vitest";
import {
  buildActionResultData,
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

  describe("successful local mutation receipt boundary", () => {
    function receipt(action = "WRITE_FILE", type: "write" | "edit" = "write") {
      return {
        success: true,
        data: buildActionResultData(
          {
            mutation: {
              action,
              requestedPath: "artifact.json",
              resolvedPath: "/workspace/artifact.json",
              success: true,
            },
            fileOperation: { type, target: "artifact.json" },
          },
          { actionName: action },
        ),
      };
    }

    it.each([
      ["WRITE_FILE", "write"],
      ["PATCH_FILE", "edit"],
      ["CREATE_DIRECTORY", "write"],
      ["TASKS_SPAWN_AGENT", "write"],
    ] as const)("preserves supported %s / %s receipts", (action, type) => {
      const result = receipt(action, type);
      const mutation = extractVerifiedLocalMutationFromActionResult(result);
      expect(mutation).toMatchObject({ action, success: true });
      expect(extractLocalMutationsFromActionResult(result)).toEqual([mutation]);
    });

    it.each(["actionName", "mutationAction", "fileOperation"])(
      "preserves a full mutation envelope without optional %s",
      (field) => {
        const result = receipt();
        delete result.data[field];
        expect(
          extractVerifiedLocalMutationFromActionResult(result),
        ).toMatchObject({
          action: "WRITE_FILE",
          success: true,
        });
        expect(extractLocalMutationsFromActionResult(result)).toHaveLength(1);
      },
    );

    it.each(["action", "success"])(
      "preserves the existing legacy %s fallback when all identities agree",
      (field) => {
        const result = receipt();
        delete (result.data.mutation as Record<string, unknown>)[field];
        expect(
          extractVerifiedLocalMutationFromActionResult(result),
        ).toMatchObject({
          action: "WRITE_FILE",
          success: true,
        });
        expect(extractLocalMutationsFromActionResult(result)).toHaveLength(1);
      },
    );

    it.each([
      ["outer read identity", { actionName: "READ_FILE" }],
      ["outer different mutation", { actionName: "PATCH_FILE" }],
      ["receipt read identity", { mutationAction: "READ_FILE" }],
      ["receipt different mutation", { mutationAction: "CREATE_DIRECTORY" }],
      ["malformed outer identity", { actionName: 17 }],
      ["malformed receipt identity", { mutationAction: null }],
      [
        "read operation",
        { fileOperation: { type: "read", target: "artifact.json" } },
      ],
      [
        "different write operation",
        { fileOperation: { type: "edit", target: "artifact.json" } },
      ],
      ["malformed operation", { fileOperation: null }],
    ])("rejects a successful receipt with %s", (_label, extra) => {
      const result = receipt();
      Object.assign(result.data, extra);
      expect(extractLocalMutationFromActionResult(result)).toBeUndefined();
      expect(
        extractVerifiedLocalMutationFromActionResult(result),
      ).toBeUndefined();
      expect(extractLocalMutationsFromActionResult(result)).toEqual([]);
    });

    it.each(["READ_FILE", "SEARCH_FILES", "SHELL", "UNKNOWN_MUTATION"])(
      "rejects internally consistent non-receipt action %s",
      (action) => {
        const result = receipt(action);
        expect(extractLocalMutationFromActionResult(result)).toBeUndefined();
        expect(
          extractVerifiedLocalMutationFromActionResult(result),
        ).toBeUndefined();
        expect(extractLocalMutationsFromActionResult(result)).toEqual([]);
      },
    );

    it.each([
      ["read action", "action", "READ_FILE"],
      ["different mutation action", "action", "PATCH_FILE"],
      ["malformed action", "action", null],
      ["non-boolean success", "success", "true"],
    ])("rejects a mutation with %s", (_label, field, value) => {
      const result = receipt();
      (result.data.mutation as Record<string, unknown>)[field] = value;
      expect(extractLocalMutationFromActionResult(result)).toBeUndefined();
      expect(
        extractVerifiedLocalMutationFromActionResult(result),
      ).toBeUndefined();
      expect(extractLocalMutationsFromActionResult(result)).toEqual([]);
    });

    it("retains failed mutation observations without promoting completion", () => {
      const result = receipt();
      (result.data.mutation as Record<string, unknown>).success = false;
      result.data.actionName = "READ_FILE";
      expect(extractLocalMutationFromActionResult(result)).toMatchObject({
        action: "WRITE_FILE",
        success: false,
      });
      expect(extractLocalMutationsFromActionResult(result)).toHaveLength(1);
      expect(
        extractVerifiedLocalMutationFromActionResult(result),
      ).toBeUndefined();
    });
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

  it.each(["failed", "cancelled"])(
    "retains verified file changes from a %s worker without promoting task completion",
    (status) => {
      const result = {
        success: false,
        data: {
          actionName: "TASKS_SPAWN_AGENT",
          delegatedExecution: {
            status,
            workdir: "/workspace/project",
            verifiedLocalMutation: true,
            changedFiles: [{ path: "package.json" }, { path: "app/page.tsx" }],
          },
        },
      };
      expect(extractLocalMutationsFromActionResult(result)).toHaveLength(2);
      expect(summarizeActionResults([result]).localMutations).toHaveLength(2);
      expect(result.success).toBe(false);
      expect(result.data.delegatedExecution.status).toBe(status);
      result.data.delegatedExecution.verifiedLocalMutation = false;
      expect(extractLocalMutationsFromActionResult(result)).toEqual([]);
    },
  );

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
