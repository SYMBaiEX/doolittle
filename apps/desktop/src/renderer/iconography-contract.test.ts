import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICON_BUTTON_CLASS, MENU_BUTTON_CLASS } from "./app-shell/shell-layout";
import { INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS } from "./components/interactive-terminal-layout";
import { WORKBENCH_ICON_BUTTON_CLASS } from "./thread-workbench/layout";

const rendererRoot = new URL(".", import.meta.url).pathname;
const legacyInterfaceGlyphs = [
  "⌕",
  "◇",
  "◆",
  "＋",
  "›",
  "‹",
  "⌄",
  "⌃",
  "↻",
  "⌁",
  "◧",
  "◫",
  "◷",
  "▱",
  "☼",
  "◐",
  "✕",
  "✎",
  "✓",
  "○",
  "←",
] as const;

function rendererSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return rendererSources(path);
    if (
      (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) ||
      entry.name.includes(".test.")
    )
      return [];
    return [path];
  });
}

describe("desktop iconography contract", () => {
  it("keeps interface glyphs on the shared icon system", () => {
    const violations = rendererSources(rendererRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const glyphs = legacyInterfaceGlyphs.filter((glyph) =>
        source.includes(glyph),
      );
      return glyphs.length ? [`${path}: ${glyphs.join(" ")}`] : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps bespoke svg markup isolated to the compact route-icon registry", () => {
    const directSvgSources = rendererSources(rendererRoot)
      .filter(
        (path) =>
          path.endsWith(".tsx") && readFileSync(path, "utf8").includes("<svg"),
      )
      .map((path) => path.slice(rendererRoot.length));

    expect(directSvgSources).toEqual(["lib.tsx"]);
  });

  it("does not rely on the inert icon-button marker without its utility contract", () => {
    const violations = rendererSources(rendererRoot).filter((path) =>
      readFileSync(path, "utf8").includes('className="icon-button"'),
    );

    expect(violations).toEqual([]);
  });

  it("keeps shared icon buttons keyboard-visible", () => {
    for (const className of [
      ICON_BUTTON_CLASS,
      MENU_BUTTON_CLASS,
      WORKBENCH_ICON_BUTTON_CLASS,
      INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS,
    ]) {
      expect(className).toContain("focus-visible:outline");
      expect(className).toContain("outline-[var(--accent-border)]");
    }
  });
});
