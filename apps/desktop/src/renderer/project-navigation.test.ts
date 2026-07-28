import { describe, expect, it } from "vitest";
import { projectNavigationTarget } from "./project-navigation";

describe("project navigation intent", () => {
  it("preserves the active page for project scope changes", () => {
    expect(projectNavigationTarget("select-scope")).toBeUndefined();
  });

  it("opens Chat only for explicit conversation actions", () => {
    expect(projectNavigationTarget("open-conversation")).toBe("chat");
    expect(projectNavigationTarget("new-conversation")).toBe("chat");
  });
});
