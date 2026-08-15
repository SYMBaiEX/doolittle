import { describe, expect, it } from "vitest";
import { VIEW_PRIMITIVES_CLASS } from "./view-layout";

describe("shared view primitives", () => {
  it("keeps narrow page titles on the density-aware token", () => {
    expect(VIEW_PRIMITIVES_CLASS).not.toContain(
      "max-[760px]:[&_.page-header_h1]:text-[clamp(",
    );
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[&_.page-header_h1]:text-[var(--page-title-size)]",
    );
  });

  it("forces action labels to remain sentence case", () => {
    for (const action of [
      "primary-button",
      "secondary-button",
      "danger-button",
    ]) {
      expect(VIEW_PRIMITIVES_CLASS).toContain(`[&_.${action}]:normal-case`);
    }
  });

  it("gives empty split workspaces a single-column override", () => {
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[&_.split-workspace.is-empty]:grid-cols-1",
    );
  });
});
