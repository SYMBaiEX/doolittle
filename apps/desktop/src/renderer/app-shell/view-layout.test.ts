import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import {
  COMMAND_PALETTE_ITEM_CLASS,
  COMMAND_PALETTE_ITEM_LABEL_CLASS,
} from "./overlay-layout";
import { VIEW_PRIMITIVES_CLASS } from "./view-layout";

describe("shared view primitives", () => {
  it("keeps transient command navigation visible without an accent rail", () => {
    expect(COMMAND_PALETTE_ITEM_CLASS).toContain(
      "aria-selected:bg-[var(--surface-hover)]",
    );
    expect(COMMAND_PALETTE_ITEM_CLASS).not.toContain("aria-selected:before:");
    expect(COMMAND_PALETTE_ITEM_CLASS).not.toContain("var(--accent)");
    expect(COMMAND_PALETTE_ITEM_LABEL_CLASS).toContain(
      "text-[length:var(--text-control)]",
    );
  });
  it("compiles readable page-description rules to the literal BEM class", async () => {
    const compiler = await compile("@tailwind utilities;");
    const candidates = VIEW_PRIMITIVES_CLASS.split(/\s+/u).filter((candidate) =>
      candidate.includes("\\_\\_"),
    );
    expect(candidates).toHaveLength(6);
    const css = compiler.build(candidates);
    expect(css).toContain(".page-header .page-header__description");
    expect(css).toContain("position: static");
    expect(css).toContain("height: auto");
    expect(css).toContain("width: auto");
    expect(css).toContain("overflow: visible");
    expect(css).toContain("white-space: normal");
    expect(css).not.toContain(".page-header .page-header description");
  });

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

  it("keeps selected route rows text-led without side stripes or filled cards", () => {
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[&_.row-card.selected_.row-card-main_strong]:font-semibold",
    );
    expect(VIEW_PRIMITIVES_CLASS).not.toContain("[&_.row-card.selected]:bg-");
    expect(VIEW_PRIMITIVES_CLASS).not.toContain(
      "[&_.row-card.selected]:shadow-",
    );
    expect(VIEW_PRIMITIVES_CLASS).not.toContain("[&_.eyebrow::before]");
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[&_.field-grid_label>span]:normal-case",
    );
  });

  it("gives empty split workspaces a single-column override", () => {
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[&_.split-workspace.is-empty]:grid-cols-1",
    );
  });

  it("keeps text-field geometry off native-shaped controls and retains their focus", async () => {
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[&_input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=color])]:outline-none",
    );
    expect(VIEW_PRIMITIVES_CLASS).not.toContain("[&_input]:outline-none");
    for (const utility of ["w-full", "border", "px-2.5", "py-2"]) {
      expect(VIEW_PRIMITIVES_CLASS).not.toContain(`[&_input]:${utility}`);
    }
    const compiler = await compile("@tailwind utilities;");
    const css = compiler.build(
      VIEW_PRIMITIVES_CLASS.split(/\s+/u).filter((candidate) =>
        candidate.startsWith("[&_input"),
      ),
    );
    expect(css).toContain(
      "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=color])",
    );
    expect(css).toContain("focus-visible");
    for (const element of ["textarea", "select"]) {
      expect(VIEW_PRIMITIVES_CLASS).toContain(
        `[&_${element}:focus-visible]:outline-none`,
      );
      expect(VIEW_PRIMITIVES_CLASS).not.toContain(
        `[&_${element}:focus-visible]:outline-2`,
      );
    }
    expect(VIEW_PRIMITIVES_CLASS).not.toContain(
      "[&_input:focus-visible]:outline-2",
    );
    expect(VIEW_PRIMITIVES_CLASS).not.toContain(
      "[&_textarea:focus-visible]:outline-[var(--accent-text)]",
    );
    for (const element of ["button", "a"]) {
      expect(VIEW_PRIMITIVES_CLASS).toContain(
        `[&_${element}:focus-visible]:outline-[var(--focus-ring)]`,
      );
    }
    expect(VIEW_PRIMITIVES_CLASS).not.toContain(
      "[&_.content-card:focus-within]",
    );
  });
});
