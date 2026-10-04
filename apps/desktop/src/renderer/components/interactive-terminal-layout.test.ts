import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import {
  INTERACTIVE_TERMINAL_BUTTON_CLASS,
  INTERACTIVE_TERMINAL_CHROME_CLASS,
  INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS,
  INTERACTIVE_TERMINAL_PRIMARY_BUTTON_CLASS,
  INTERACTIVE_TERMINAL_ROOT_CLASS,
} from "./interactive-terminal-layout";

describe("interactive terminal presentation contract", () => {
  it("compiles real density geometry and 44px narrow dimensions", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const css = compiler.build(
      INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS.split(/\s+/u),
    );
    expect(css).toContain("width: var(--control-height)");
    expect(css).toContain("height: var(--control-height)");
    expect(css).toContain("min-height: var(--control-height)");
    expect(css).toContain("min-width: var(--control-height)");
    expect(css).toContain("@media (width < 760px)");
    expect(css).toContain("width: calc(var(--spacing) * 11)");
    expect(css).toContain("height: calc(var(--spacing) * 11)");
    expect(css).toContain("min-width: calc(var(--spacing) * 11)");
    expect(css).toContain("min-height: calc(var(--spacing) * 11)");
  });

  it("uses density-sized utility targets with a 44px narrow minimum", () => {
    for (const value of [
      INTERACTIVE_TERMINAL_BUTTON_CLASS,
      INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS,
      INTERACTIVE_TERMINAL_PRIMARY_BUTTON_CLASS,
    ]) {
      expect(value).toContain("min-h-[var(--control-height)]");
      expect(value).toContain("min-w-[var(--control-height)]");
      expect(value).toContain("max-[760px]:min-h-11");
      expect(value).toContain("max-[760px]:min-w-11");
      expect(value).toContain("focus-visible:outline-[var(--focus-ring)]");
      expect(value).toContain("disabled:cursor-not-allowed");
      expect(value).toContain("motion-reduce:transition-none");
      expect(value).not.toMatch(/(?:min-h-4\.75|size-5\.5|min-h-5\.5)/u);
    }
  });

  it("compiles pane-local toolbar bands independently of viewport touch sizing", async () => {
    expect(INTERACTIVE_TERMINAL_ROOT_CLASS).toContain("@container/terminal");
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const css = compiler.build([
      "@container/terminal",
      "@max-[1180px]/terminal:row-start-1",
      "@max-[1180px]/terminal:row-start-2",
      "@min-[1280px]/terminal:hidden",
      "@min-[1280px]/terminal:inline-flex",
    ]);
    expect(css).toContain("container-type: inline-size");
    expect(css).toContain("container-name: terminal");
    expect(css).toContain("@container terminal (width < 1180px)");
    expect(css).toContain("@container terminal (width >= 1280px)");
    expect(css).toContain("grid-row-start: 1");
    expect(css).toContain("grid-row-start: 2");
  });

  it("keeps chrome solid without ornamental gradients or glows", () => {
    for (const value of [
      INTERACTIVE_TERMINAL_ROOT_CLASS,
      INTERACTIVE_TERMINAL_CHROME_CLASS,
    ]) {
      expect(value).not.toContain("gradient(");
      expect(value).not.toContain("shadow-");
      expect(value).not.toContain("color-mix");
    }
  });
});
