import { describe, expect, it } from "bun:test";
import { applyTuiLayout, type TuiLayoutWidgets } from "@/cli/tui-layout";

function createLayout(): TuiLayoutWidgets {
  return {
    header: {},
    activity: {},
    response: {},
    sidebar: {},
    transportBox: {},
    executionBox: {},
    assistBox: {},
    paletteOverlay: {},
    paletteInput: {},
    paletteList: {},
    composerOverlay: {},
    composer: {},
    inputBox: {},
    footer: {},
  } as unknown as TuiLayoutWidgets;
}

describe("applyTuiLayout", () => {
  it("lays out narrow screens with collapsed operations", () => {
    const layout = createLayout();

    applyTuiLayout({ width: 100, height: 40 } as never, layout, {
      opsCollapsed: true,
    });

    expect(layout.header.height).toBe(3);
    expect(layout.response.width).toBe("100%");
    expect(layout.response.height).toBe("68%-1");
    expect(layout.activity.top).toBe("68%+2");
    expect(layout.sidebar.top).toBe("76%+2");
    expect(layout.assistBox.top).toBe("88%+2");
    expect(layout.paletteOverlay.width).toBe("94%");
    expect(layout.composerOverlay.width).toBe("96%");
    expect(layout.footer.height).toBe(1);
  });

  it("lays out compact screens with expanded operations", () => {
    const layout = createLayout();

    applyTuiLayout({ width: 120, height: 32 } as never, layout, {
      opsCollapsed: false,
    });

    expect(layout.response.width).toBe("86%");
    expect(layout.response.height).toBe("61%-1");
    expect(layout.activity.height).toBe("21%-2");
    expect(layout.sidebar.height).toBe("28%");
    expect(layout.transportBox.top).toBe("22%+3");
    expect(layout.assistBox.height).toBe("39%-1");
    expect(layout.paletteOverlay.width).toBe("82%");
    expect(layout.composerOverlay.width).toBe("88%");
  });

  it("lays out wide screens with the full right rail", () => {
    const layout = createLayout();

    applyTuiLayout({ width: 160, height: 40 } as never, layout);

    expect(layout.response.width).toBe("86%");
    expect(layout.response.height).toBe("70%-1");
    expect(layout.activity.height).toBe("16%-2");
    expect(layout.sidebar.left).toBe("86%");
    expect(layout.sidebar.height).toBe("84%-2");
    expect(layout.executionBox.top).toBe("32%+2");
    expect(layout.assistBox.height).toBe("40%-1");
    expect(layout.paletteOverlay.width).toBe("72%");
    expect(layout.composerOverlay.width).toBe("78%");
  });
});
