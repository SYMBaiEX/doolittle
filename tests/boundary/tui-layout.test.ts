import { describe, expect, it } from "vitest";
import {
  applyTuiLayout,
  resolveCockpitRailContentWidth,
} from "../../apps/cli/src/cli/tui-layout";

interface MockPanel {
  top: number | string;
  left: number | string;
  width: number | string;
  height: number | string;
  hidden: boolean;
  hide(): void;
  show(): void;
}

function panel(): MockPanel {
  return {
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    hidden: false,
    hide() {
      this.hidden = true;
    },
    show() {
      this.hidden = false;
    },
  };
}

function fixture(width: number, height: number) {
  const panels = {
    header: panel(),
    inputBox: panel(),
    footer: panel(),
    response: panel(),
    activity: panel(),
    sidebar: panel(),
    assistBox: panel(),
    paletteOverlay: panel(),
    paletteInput: panel(),
    paletteList: panel(),
    composerOverlay: panel(),
    composer: panel(),
  };
  return {
    screen: { width, height },
    panels,
  };
}

function layout(width: number, height: number, opsCollapsed = true) {
  const { screen, panels } = fixture(width, height);
  applyTuiLayout(screen as never, panels as never, { opsCollapsed });
  return panels;
}

describe("cockpit layout geometry model", () => {
  it("clamps the two-column rail to a scanable fixed width range", () => {
    const at110 = layout(110, 30);
    expect(at110.sidebar.left).toBe(80);
    expect(at110.sidebar.width).toBe(30);
    expect(resolveCockpitRailContentWidth(110)).toBe(26);

    const at140 = layout(140, 40);
    expect(at140.sidebar.left).toBe(107);
    expect(at140.sidebar.width).toBe(33);

    const at200 = layout(200, 50);
    expect(at200.sidebar.left).toBe(158);
    expect(at200.sidebar.width).toBe(42);
  });

  it("uses progressive ops disclosure at the narrow minimum geometry", () => {
    const panels = layout(80, 24, true);

    expect(panels.activity.hidden).toBe(true);
    expect(panels.response.top).toBe(3);
    expect(panels.response.height).toBe(7);
    expect(panels.sidebar.top).toBe(10);
    expect(panels.sidebar.height).toBe(4);
    expect(panels.assistBox.top).toBe(14);
    expect(panels.assistBox.height).toBe(6);
  });

  it("restores the ops stream as a prioritized panel when expanded", () => {
    const panels = layout(80, 24, false);

    expect(panels.activity.hidden).toBe(false);
    expect(panels.response.height).toBe(5);
    expect(panels.activity.top).toBe(8);
    expect(panels.activity.height).toBe(5);
    expect(panels.sidebar.top).toBe(13);
    expect(panels.sidebar.height).toBe(3);
    expect(panels.assistBox.top).toBe(16);
    expect(panels.assistBox.height).toBe(4);
  });
});
