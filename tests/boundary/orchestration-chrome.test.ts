import { expect, it } from "vitest";
import {
  delegationRequirementCopy,
  orchestrationScopeLabel,
} from "../../apps/desktop/src/renderer/orchestration-helpers";

it("uses the current scope as the inner orchestration title", () => {
  expect(
    orchestrationScopeLabel({ projectScope: "all", workspaceLabel: "Ignored" }),
  ).toBe("All projects");
  expect(
    orchestrationScopeLabel({
      projectScope: "project-1",
      workspaceLabel: "Fixture project",
    }),
  ).toBe("Fixture project");
  expect(
    orchestrationScopeLabel({
      projectScope: "unscoped",
      workspaceLabel: "General",
    }),
  ).toBe("Unscoped work");
  expect(
    orchestrationScopeLabel({ projectScope: "project-1", workspaceLabel: " " }),
  ).toBe("Selected project");
});

it("keeps the recoverable delegation prerequisite compact", () => {
  const blockReason =
    "Open a workspace chat with Doolittle (Lead) before starting or changing delegated tasks.";
  expect(
    delegationRequirementCopy({ blockReason, canOpenLeadChat: true }),
  ).toBe("Delegated tasks need a Lead workspace chat.");
  expect(
    delegationRequirementCopy({ blockReason, canOpenLeadChat: false }),
  ).toBe(blockReason);
});
