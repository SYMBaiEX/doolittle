import { describe, expect, it } from "vitest";
import { buildHeaderContent } from "../../apps/cli/src/cli/cockpit-chrome";
import {
  supportsTerminalUnicode,
  terminalGlyph,
} from "../../apps/cli/src/cli/terminal-glyphs";
import { getTuiTheme } from "../../packages/agent/src/runtime/theme-catalog";

describe("terminal glyph selection", () => {
  it("detects UTF-8 capability from locale variables in precedence order", () => {
    expect(supportsTerminalUnicode({ LANG: "en_US.UTF-8" })).toBe(true);
    expect(supportsTerminalUnicode({ LANG: "C.UTF-8" })).toBe(true);
    expect(supportsTerminalUnicode({ LANG: "C" })).toBe(false);
    expect(supportsTerminalUnicode({ LANG: "POSIX" })).toBe(false);
    expect(supportsTerminalUnicode({ LANG: "en_US.ISO8859-1" })).toBe(false);
    // LC_ALL wins over LC_CTYPE and LANG.
    expect(supportsTerminalUnicode({ LC_ALL: "C", LANG: "en_US.UTF-8" })).toBe(
      false,
    );
    expect(supportsTerminalUnicode({ LC_ALL: "C.UTF-8", LANG: "C" })).toBe(
      true,
    );
    // LC_CTYPE wins over LANG when LC_ALL is unset.
    expect(
      supportsTerminalUnicode({ LC_CTYPE: "C", LANG: "en_US.UTF-8" }),
    ).toBe(false);
    // No locale evidence keeps the unicode set: modern terminal emulators
    // negotiate UTF-8 rendering regardless of shell locale variables.
    expect(supportsTerminalUnicode({})).toBe(true);
    expect(supportsTerminalUnicode({ LC_ALL: "", LANG: "" })).toBe(true);
  });

  it("falls back to ASCII separators in cockpit chrome under a POSIX locale", () => {
    const theme = getTuiTheme("orange");
    const original = process.env.LC_ALL;
    try {
      process.env.LC_ALL = "C";
      const ascii = buildHeaderContent("Doolittle", theme);
      expect(ascii).not.toContain("·");
      expect(ascii).toContain("cockpit for observability | shell");
      process.env.LC_ALL = "en_US.UTF-8";
      expect(buildHeaderContent("Doolittle", theme)).toContain("·");
    } finally {
      if (original === undefined) {
        delete process.env.LC_ALL;
      } else {
        process.env.LC_ALL = original;
      }
    }
  });

  it("picks the unicode glyph when supported and the ASCII fallback otherwise", () => {
    expect(terminalGlyph("┌", "+", true)).toBe("┌");
    expect(terminalGlyph("┌", "+", false)).toBe("+");
    expect(terminalGlyph("█", "#", false)).toBe("#");
  });
});
