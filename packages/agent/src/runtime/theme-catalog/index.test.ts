import { describe, expect, it } from "bun:test";
import {
  DEFAULT_TUI_THEME,
  getReadableTextColor,
  getTuiTheme,
  nextTuiTheme,
  previousTuiTheme,
  resolveTuiThemeName,
} from ".";

describe("theme catalog", () => {
  it("resolves aliases and falls back to the default theme", () => {
    expect(resolveTuiThemeName("dune")).toBe("orange");
    expect(resolveTuiThemeName("  DUNE  ")).toBe("orange");
    expect(resolveTuiThemeName("unknown")).toBeUndefined();
    expect(resolveTuiThemeName("toString")).toBeUndefined();
    expect(getTuiTheme("unknown").name).toBe(DEFAULT_TUI_THEME);
  });

  it("cycles themes in both directions", () => {
    const current = DEFAULT_TUI_THEME;
    const next = nextTuiTheme(current);

    expect(previousTuiTheme(next)).toBe(current);
  });

  it("picks readable text colors for light and dark backgrounds", () => {
    expect(getReadableTextColor("#ffffff")).toBe("black");
    expect(getReadableTextColor("#111111")).toBe("white");
    expect(getReadableTextColor("not-a-color", "light", "dark")).toBe("light");
  });
});
