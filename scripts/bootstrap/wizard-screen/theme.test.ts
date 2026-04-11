import { describe, expect, it } from "bun:test";
import blessed from "blessed";
import { applyWizardTheme, DEFAULT_TUI_THEME, getThemeByName } from "./theme";
import { createWizardWidgets } from "./widgets";

describe("wizard-screen theme", () => {
  it("applies theme colors and footer text", () => {
    const screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      grabKeys: true,
      mouse: false,
    });
    const widgets = createWizardWidgets(screen, 4, "footer");
    applyWizardTheme(widgets, DEFAULT_TUI_THEME, (label) => `key:${label}`);

    const theme = getThemeByName(DEFAULT_TUI_THEME);
    expect(widgets.header.style.bg).toBe(theme.primary);
    expect(widgets.footer.getContent()).toContain("key:Ctrl-T/Y");

    screen.destroy();
  });
});
