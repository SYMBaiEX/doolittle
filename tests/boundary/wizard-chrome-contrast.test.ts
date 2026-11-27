import { describe, expect, it } from "vitest";
import {
  getTuiTheme,
  listTuiThemes,
} from "../../packages/agent/src/runtime/theme-catalog";
import { themeContrast } from "../../packages/ui/src/themes";
import {
  buildWizardRenderModel,
  wizardSelectionStyle,
} from "../../scripts/bootstrap/wizard-screen/render";
import { createWizardSnapshot } from "../../scripts/bootstrap/wizard-screen/state";

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

describe("wizard chrome contrast", () => {
  it("derives selection row foregrounds readable on every catalog theme primary", () => {
    for (const summary of listTuiThemes()) {
      const theme = getTuiTheme(summary.name);
      const selection = wizardSelectionStyle(theme);
      expect(selection.bg).toBe(theme.primary);
      const contrast = luminanceAwareContrast(selection.fg, theme.primary);
      expect(
        contrast,
        `${theme.name} selection contrast (${selection.fg} on ${theme.primary})`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("paints the sidebar current section on a contrast-safe primary fill", () => {
    for (const summary of listTuiThemes()) {
      const theme = getTuiTheme(summary.name);
      const model = buildWizardRenderModel(
        createWizardSnapshot(),
        theme,
        { cols: 120, rows: 40 },
      );
      // The current-section row must carry its own background fill. Before
      // this, the foreground was derived against theme.secondary — a surface
      // that is never painted — and came out black on the black panel in the
      // default theme, rendering the current section invisible.
      const currentRow = model.sidebarContent
        .split("\n")
        .find((row) => row.includes("› Preflight"));
      expect(currentRow, `${theme.name} current row`).toBeDefined();
      expect(currentRow).toContain(`{${theme.primary}-bg}`);
      expect(currentRow).toContain(`{${model.selectionStyle.fg}-fg}`);
      expect(
        luminanceAwareContrast(model.selectionStyle.fg, theme.primary),
        `${theme.name} sidebar selection contrast`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("never hardcodes the selection foreground to a fixed color", () => {
    const foregrounds = new Set(
      listTuiThemes().map(
        (summary) => wizardSelectionStyle(getTuiTheme(summary.name)).fg,
      ),
    );
    // The catalog spans near-black (blue #0B35F1) to near-white (ivory
    // #F2F2F2) primaries, so no single foreground survives every theme: the
    // derivation must produce both ends of the ladder.
    expect(foregrounds.size).toBeGreaterThan(1);
  });
});
