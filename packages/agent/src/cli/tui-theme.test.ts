import { describe, expect, it } from "bun:test";
import { applyTuiTheme } from "@/cli/tui-theme";
import type { TuiWidgetSet } from "@/cli/tui-widget-factory";
import { getTuiTheme } from "@/runtime/theme-catalog";

function styledWidget() {
  return {
    style: {},
    setContent(_value: string) {},
  };
}

describe("applyTuiTheme", () => {
  it("applies the active theme palette across the widget set", () => {
    const theme = getTuiTheme("orange");
    const widgets = {
      header: styledWidget(),
      activity: { style: {} },
      response: { style: {} },
      sidebar: { style: {} },
      transportBox: { style: {} },
      executionBox: { style: {} },
      assistBox: { style: {} },
      paletteOverlay: { style: {} },
      paletteInput: { style: {} },
      paletteList: { style: {} },
      composerOverlay: { style: {} },
      composer: { style: {} },
      inputBox: { style: {} },
      footer: { style: {} },
    } as unknown as TuiWidgetSet;

    applyTuiTheme("Doolittle", theme, widgets);

    expect(widgets.header.style.bg).toBe(theme.primary);
    expect(widgets.footer.style.bg).toBe(theme.baseBg);
    expect(widgets.paletteList.style.selected).toMatchObject({
      bg: theme.primary,
      fg: theme.baseFg,
    });
  });
});
