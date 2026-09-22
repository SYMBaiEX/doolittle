import { describe, expect, it } from "vitest";
import {
  continuesWorkspaceMutationIntent,
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
    "Inspect README.md, then edit it to fix the setup instructions.",
    "Do not edit package.json, but create README.md.",
    "Explain how this repo works, then update its README.md.",
    "Fix the source file without modifying unrelated files.",
    'Update "README.md" and preserve existing instructions.',
    "Please write `src/page.tsx`.",
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
    "HARNESS-A-0922: Read-only verification. Inspect this selected project’s package.json, README.md, and two relevant source files using tools. Report the exact working directory, package name, scripts, and a short source summary. Do not create, edit, delete, install, or start anything. Include HARNESS-A-0922 in your final answer.",
    "Inspect the project. Don't create, edit, or delete any files.",
    "Read README.md without editing or deleting it.",
    "Review the source files and make no changes.",
    "Review the project; avoid creating or modifying files.",
    'Inspect the README example "create a source file" and explain it.',
    "Review the quoted instruction 'edit src/page.tsx' without executing it.",
    "Find `bun run build` in package.json and report its value.",
    "Inspect the source files and report what you would edit.",
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

  it("carries an unfinished mutation obligation into a concise continuation", () => {
    const recentMessages = [
      {
        role: "assistant",
        text: "I stopped before completing the requested workspace change. No verified local mutation receipt was recorded (REQUESTED_LOCAL_MUTATION).",
      },
    ];

    expect(continuesWorkspaceMutationIntent("Continue", recentMessages)).toBe(
      true,
    );
    expect(
      renderWorkspaceMutationExecutionContract("Continue", recentMessages),
    ).not.toEqual([]);
    expect(
      continuesWorkspaceMutationIntent("Tell me about this", recentMessages),
    ).toBe(false);
    expect(
      renderWorkspaceMutationExecutionContract(
        "Continue, but do not edit or create any files.",
        recentMessages,
      ),
    ).toEqual([]);
    expect(
      renderWorkspaceMutationExecutionContract(
        "Continue inspecting the project without editing any files.",
        recentMessages,
      ),
    ).toEqual([]);
  });
});
