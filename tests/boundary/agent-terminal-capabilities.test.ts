import {
  contrastSelectionStyle,
  ellipsizeText,
  paintText,
  resolveTerminalColorPolicy,
  severityBlessedTag,
  supportsTerminalUnicode,
  terminalColorEnabled,
  terminalGlyph,
} from "@doolittle/agent/runtime/terminal-capabilities";
import { describe, expect, it } from "vitest";

describe("shared terminal capabilities", () => {
  it("resolves the canonical color policy and semantic role bytes", () => {
    expect(terminalColorEnabled({ isTTY: false }, {})).toBe(false);
    expect(
      terminalColorEnabled(
        { isTTY: false },
        { FORCE_COLOR: "1", NO_COLOR: "1" },
      ),
    ).toBe(true);
    expect(
      resolveTerminalColorPolicy({ isTTY: true }, { COLORFGBG: "0;15" }),
    ).toEqual({ enabled: true, background: "light" });
    expect(
      paintText("info", "info", { enabled: true, background: "light" }),
    ).toBe("\x1b[34minfo\x1b[0m");
  });

  it("resolves locale unicode capability and glyph fallbacks", () => {
    expect(supportsTerminalUnicode({ LANG: "en_US.UTF-8" })).toBe(true);
    expect(supportsTerminalUnicode({ LC_ALL: "C", LANG: "en_US.UTF-8" })).toBe(
      false,
    );
    expect(terminalGlyph("●", "*", false)).toBe("*");
  });

  it("exposes the canonical presentation primitives", () => {
    expect(ellipsizeText("😀".repeat(20), 5)).toBe("😀😀...");
    expect(severityBlessedTag("warning")).toBe("{yellow-fg}[!]{/}");
    expect(contrastSelectionStyle("#F2F2F2")).toEqual({
      bg: "#F2F2F2",
      fg: "black",
    });
  });
});
