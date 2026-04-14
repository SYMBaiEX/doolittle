import { describe, expect, it } from "bun:test";
import {
  currentBusyFrame,
  renderFooterContent,
  resolveFooterHint,
} from "@/cli/tui-control-deck/footer";

describe("tui control deck footer helpers", () => {
  it("falls back to the default busy frame when no frames are configured", () => {
    expect(currentBusyFrame(() => [], 3)).toBe("•");
  });

  it("resolves palette and composer hints from the active focus", () => {
    const paletteList = {};
    const inputBox = {};

    expect(
      resolveFooterHint({
        screen: { focused: paletteList } as never,
        responsePane: {} as never,
        activityPane: {} as never,
        sidebarPane: {} as never,
        assistBox: {} as never,
        inputBox: inputBox as never,
        paletteList: paletteList as never,
        getCurrentMode: () => "gateway",
        isPaletteOpen: () => true,
        isComposerOpen: () => false,
        formatKeyLabel: (label) => label,
      }),
    ).toBe("Enter run selected");

    expect(
      resolveFooterHint({
        screen: { focused: inputBox } as never,
        responsePane: {} as never,
        activityPane: {} as never,
        sidebarPane: {} as never,
        assistBox: {} as never,
        inputBox: inputBox as never,
        paletteList: paletteList as never,
        getCurrentMode: () => "assist",
        isPaletteOpen: () => false,
        isComposerOpen: () => true,
        formatKeyLabel: (label) => `fmt:${label}`,
      }),
    ).toBe("fmt:Ctrl-S submit draft");
  });

  it("builds footer content from the current hint and busy frame", () => {
    expect(
      renderFooterContent(
        {
          buildFooterContent: (hint, busyFrame) => `${hint} :: ${busyFrame}`,
          getBusyFrames: () => ["•", "◦"],
        },
        {
          footerHint: "Enter sessions",
          busyFrameIndex: 1,
        },
      ),
    ).toBe("Enter sessions :: ◦");
  });
});
