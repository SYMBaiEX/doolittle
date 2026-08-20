import { describe, expect, it } from "vitest";
import { VIEW_PRIMITIVES_CLASS } from "./view-layout";

describe("shared view primitives", () => {
  it("keeps narrow page titles on the density-aware token", () => {
    expect(VIEW_PRIMITIVES_CLASS).not.toContain(
      "max-[760px]:[&_.page-header_h1]:text-[clamp(",
    );
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[&_.page-header_h1]:text-[length:var(--page-title-size)]",
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

  it("keeps route section headings below the page title hierarchy", () => {
    expect(VIEW_PRIMITIVES_CLASS).toContain("[&_.card-heading_h2]:text-sm");
    expect(VIEW_PRIMITIVES_CLASS).toContain("[&_.empty-block_h3]:text-sm");
    expect(VIEW_PRIMITIVES_CLASS).not.toContain(
      "[&_.card-heading_h2]:text-[17px]",
    );
  });

  it("uses spacing instead of decorative rules for document hierarchy", () => {
    expect(VIEW_PRIMITIVES_CLASS).not.toContain("[&_.page-header]:border-b");
    expect(VIEW_PRIMITIVES_CLASS).not.toContain("[&_.page-header::after]");
    expect(VIEW_PRIMITIVES_CLASS).not.toContain("[&_.form-actions]:border-t");
    expect(VIEW_PRIMITIVES_CLASS).not.toContain("[&_.status-row]:border-b");
  });

  it("gives empty split workspaces a single-column override", () => {
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[&_.split-workspace.is-empty]:grid-cols-1",
    );
  });
});
