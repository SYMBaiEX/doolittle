import type { ActionResult } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { buildActionResultData } from "@/runtime/action-result-metadata";
import {
  assessTurnExecutionContract,
  buildTurnExecutionContract,
} from "./execution-contract";

describe("local mutation execution contract receipt admission", () => {
  const request = "Create artifact.json in this workspace.";

  function assess(result: ActionResult, userRequest = request) {
    const actionResults = [result];
    return assessTurnExecutionContract({
      actionResults,
      contract: buildTurnExecutionContract({ actionResults, userRequest }),
    });
  }

  it.each([
    ["a tool-call name alone", { actionName: "WRITE_FILE" }],
    [
      "a WRITE_FILE wrapper around a READ_FILE mutation",
      {
        actionName: "WRITE_FILE",
        mutationKind: "local-file",
        mutationAction: "READ_FILE",
        mutation: { action: "READ_FILE", success: true },
      },
    ],
    [
      "a conflicting receipt action",
      {
        actionName: "WRITE_FILE",
        mutationKind: "local-file",
        mutationAction: "READ_FILE",
        mutation: { action: "WRITE_FILE", success: true },
      },
    ],
    [
      "an unsupported local mutation action",
      {
        actionName: "WRITE_FILE",
        mutationKind: "local-file",
        mutationAction: "UNKNOWN_MUTATION",
        mutation: { action: "UNKNOWN_MUTATION", success: true },
      },
    ],
  ])("refuses a requested mutation backed by %s", (_label, data) => {
    const assessment = assess({ success: true, data });
    expect(assessment.ok).toBe(false);
    expect(assessment.failureMessage).toContain(
      "No verified local mutation receipt was recorded",
    );
  });

  it.each([
    ["WRITE_FILE", "write"],
    ["PATCH_FILE", "edit"],
    ["CREATE_DIRECTORY", "write"],
    ["TASKS_SPAWN_AGENT", "write"],
  ] as const)("accepts a supported %s / %s receipt", (action, type) => {
    expect(
      assess({
        success: true,
        data: buildActionResultData(
          {
            mutation: {
              action,
              success: true,
              resolvedPath: "/workspace/artifact.json",
            },
            fileOperation: { type, target: "artifact.json" },
          },
          { actionName: action },
        ),
      }),
    ).toEqual({ ok: true });
  });

  it.each(["WRITE_FILE", "READ_FILE", "SHELL", "UNKNOWN_ACTION"])(
    "keeps name-only %s observations neutral for a non-mutation request",
    (actionName) => {
      expect(
        assess(
          { success: true, data: { actionName } },
          "Explain the existing project.",
        ),
      ).toEqual({ ok: true });
    },
  );
});
