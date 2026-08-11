import { describe, expect, it } from "vitest";
import {
  hasExplicitWorkspaceMutationIntent,
  renderWorkspaceMutationExecutionContract,
} from "./workspace-mutation-intent";

describe("workspace mutation intent", () => {
  it.each([
    "Review the repo and write a README.md for it",
    "Fix the provider accounts page",
    "Refactor src/runtime/chat.ts",
    "Add tests for the workspace service",
    "Delete the unused component file",
  ])("detects explicit local mutation requests: %s", (message) => {
    expect(hasExplicitWorkspaceMutationIntent(message)).toBe(true);
  });

  it.each([
    "Review the repo and tell me what it is",
    "How would you fix the provider accounts page?",
    "Explain how to write a README",
    "What should I change in this codebase?",
    "Write an email to the team",
    "Run the tests",
  ])("leaves informational and non-file requests alone: %s", (message) => {
    expect(hasExplicitWorkspaceMutationIntent(message)).toBe(false);
  });

  it("renders a planner-visible receipt contract only for mutation turns", () => {
    expect(
      renderWorkspaceMutationExecutionContract(
        "Review the repo and write a README.md for it",
      ),
    ).toEqual([
      "TURN EXECUTION CONTRACT",
      "The current request explicitly requires a local workspace mutation.",
      "Reading, searching, inspecting, or describing a planned change is not completion.",
      "Continue until WRITE_FILE, PATCH_FILE, CREATE_DIRECTORY, or another receipt-producing local mutation succeeds.",
      "If the change cannot be made, stop with the concrete blocker; never end on a progress-only promise.",
    ]);
    expect(
      renderWorkspaceMutationExecutionContract("Explain this repo"),
    ).toEqual([]);
  });
});
