import { describe, expect, it } from "vitest";
import { shouldShowSessionEmptyLanding } from "./WorkspacePages";

describe("workspace route density", () => {
  it("uses one empty landing until sessions or an active search exist", () => {
    expect(shouldShowSessionEmptyLanding(0, "")).toBe(true);
    expect(shouldShowSessionEmptyLanding(0, "   ")).toBe(true);
    expect(shouldShowSessionEmptyLanding(0, "README")).toBe(false);
    expect(shouldShowSessionEmptyLanding(1, "")).toBe(false);
  });
});
