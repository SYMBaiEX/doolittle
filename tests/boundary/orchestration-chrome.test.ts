import { expect, it } from "vitest";
import { orchestrationScopeLabel } from "../../apps/desktop/src/renderer/orchestration-helpers";

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
    orchestrationScopeLabel({ projectScope: "project-1", workspaceLabel: " " }),
  ).toBe("Selected project");
});
