import { describe, expect, it } from "vitest";
import { VIEW_PRIMITIVES_CLASS } from "./view-layout";

describe("shared view primitives", () => {
  it("lets every route surface span the full viewport column", () => {
    expect(VIEW_PRIMITIVES_CLASS).toContain("[&_.page]:mx-0");
    expect(VIEW_PRIMITIVES_CLASS).toContain("[&_.page]:w-full");
    expect(VIEW_PRIMITIVES_CLASS).toContain("[&_.page]:max-w-none");
    expect(VIEW_PRIMITIVES_CLASS).not.toContain(
      "[&_.page]:w-[min(100%,1380px)]",
    );
  });

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

  it("keeps shared action buttons compact and visually quiet", () => {
    expect(VIEW_PRIMITIVES_CLASS).toContain("[&_.primary-button]:px-2.25");
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[&_.secondary-button]:border-[var(--border)]",
    );
    expect(VIEW_PRIMITIVES_CLASS).toContain("[&_.text-button]:font-semibold");
    expect(VIEW_PRIMITIVES_CLASS).not.toContain("[&_.text-button]:font-bold");
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

  it("gives plain text controls a token-driven focus indicator without touching switches", () => {
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[&_input:not([type=checkbox]):not([type=radio]):focus-visible]:outline-[var(--accent-text)]",
    );
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[&_textarea:focus-visible]:outline-[var(--accent-text)]",
    );
    expect(VIEW_PRIMITIVES_CLASS).not.toContain(
      "[&_input:focus-visible]:outline-2",
    );
  });
});
