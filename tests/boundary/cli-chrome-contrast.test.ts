import { describe, expect, it } from "vitest";
import { buildHeaderContent } from "../../apps/cli/src/cli/cockpit-chrome";
import { contrastSelectionStyle } from "../../apps/cli/src/cli/terminal-presentation";
import { renderPaletteItems } from "../../apps/cli/src/cli/tui-overlays/bindings";
import {
  getReadableTextColor,
  getTuiTheme,
  listTuiThemes,
} from "../../packages/agent/src/runtime/theme-catalog";
import { themeContrast } from "../../packages/ui/src/themes";

function luminanceAwareContrast(
  foreground: string,
  background: string,
): number {
  const hex =
    foreground === "white"
      ? "#ffffff"
      : foreground === "black"
        ? "#000000"
        : foreground;
  return themeContrast(hex, background);
}

describe("cockpit chrome contrast", () => {
  it("keeps every catalog theme readable on the primary header surface", () => {
    for (const summary of listTuiThemes()) {
      const theme = getTuiTheme(summary.name);
      const onPrimary = getReadableTextColor(theme.primary);
      expect(
        luminanceAwareContrast(onPrimary, theme.primary),
        `${theme.name} on-primary contrast`,
      ).toBeGreaterThanOrEqual(4.5);

      // The header renders on the theme.primary surface. Hardcoded foreground
      // color tags would bypass the contrast-derived base foreground, so the
      // content must carry no fg color overrides at all.
      const content = buildHeaderContent("Doolittle", theme);
      expect(
        content.match(/\{[a-z#0-9]+-fg\}/giu),
        `${theme.name} header must not hardcode foreground colors`,
      ).toBeNull();
    }
  });

  it("derives selection foregrounds that stay readable on theme primary", () => {
    for (const summary of listTuiThemes()) {
      const theme = getTuiTheme(summary.name);
      const selection = contrastSelectionStyle(theme.primary);
      expect(selection.bg).toBe(theme.primary);
      expect(
        luminanceAwareContrast(selection.fg, theme.primary),
        `${theme.name} selection contrast`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("marks the selected palette row with a textual indicator", () => {
    const items = renderPaletteItems("theme", process.cwd(), 1);
    expect(items.length).toBeGreaterThan(1);
    const marked = items.filter((item) => item.startsWith(">"));
    expect(marked).toHaveLength(1);
    expect(items[1]).toMatch(/^>/u);
    expect(items[0]).not.toMatch(/^>/u);
  });
});
