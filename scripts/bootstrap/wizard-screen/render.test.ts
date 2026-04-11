import { describe, expect, it } from "bun:test";
import { getTuiTheme } from "../../../packages/agent/src/runtime/theme-catalog";
import { buildWizardBaseFooter, buildWizardRenderModel } from "./render";
import { createWizardSnapshot } from "./state";

describe("wizard-screen render helpers", () => {
  it("builds the expected render model for wide and narrow viewports", () => {
    const snapshot = createWizardSnapshot({
      currentSection: "Awakening",
      currentDetail: "Initialize the body",
      logLines: ["line-1", "line-2"],
    });
    const theme = getTuiTheme("ember");

    const wide = buildWizardRenderModel(snapshot, theme, {
      cols: 120,
      rows: 40,
    });
    expect(wide.tooSmall).toBe(false);
    expect(wide.headerContent).toContain("DOOLITTLE // AWAKENING");
    expect(wide.sidebarContent).toContain("› Awakening");
    expect(wide.detailContent).toContain("Initialize the body");
    expect(wide.logContent).toContain("line-2");

    const narrow = buildWizardRenderModel(snapshot, theme, {
      cols: 80,
      rows: 20,
    });
    expect(narrow.tooSmall).toBe(true);
    expect(narrow.detailContent).toContain("Terminal Too Small");
    expect(narrow.logContent).toContain("WARNING:");
  });

  it("builds the base footer with the key labels", () => {
    const footer = buildWizardBaseFooter((label) => `<${label}>`);
    expect(footer).toContain("<Ctrl-T>");
    expect(footer).toContain("<Ctrl-Y>");
    expect(footer).toContain("<Ctrl-C>");
  });
});
