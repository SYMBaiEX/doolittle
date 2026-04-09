import { describe, expect, it } from "bun:test";
import blessed from "blessed";
import { createWizardWidgets } from "./widgets";

describe("wizard-screen widgets", () => {
  it("creates the expected widget surface", () => {
    const screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      grabKeys: true,
      mouse: false,
    });
    const widgets = createWizardWidgets(screen, 4, "footer");

    expect(widgets.header.options.top).toBe(0);
    expect(widgets.sidebar.options.label).toContain("Ritual Stages");
    expect(widgets.detail.options.label).toContain("Current Pulse");
    expect(widgets.logBox.options.label).toContain("Setup Feed");
    expect(widgets.footer.getContent()).toBe("footer");

    screen.destroy();
  });
});
