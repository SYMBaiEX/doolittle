import {
  parseThemeBundleV2,
  parseThemeManifestV2,
} from "@doolittle/contracts/theme";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_THEMES,
  CANVAS_THEME,
  COMPANION_THEME,
  legacyThemeColor,
  migrateLegacyThemeBundle,
  themeCssVariables,
  validateThemeAccessibility,
} from "./themes";

describe("versioned themes", () => {
  it.each(BUILT_IN_THEMES)("validates $name in both appearances", (theme) => {
    expect(() => validateThemeAccessibility(theme)).not.toThrow();
    for (const appearance of ["light", "dark"] as const) {
      const tokens = themeCssVariables(theme, appearance);
      expect(tokens["--control-height"]).toBe("40px");
      expect(tokens["--text-body"]).toBe("16px");
      expect(tokens["--text-control"]).toBe("14px");
      expect(tokens["--sidebar-width"]).toBe("248px");
    }
  });

  it("makes Canvas a distinct composition, geometry, typography and palette", () => {
    expect(CANVAS_THEME.layout).toBe("canvas");
    const canvas = themeCssVariables(CANVAS_THEME, "dark");
    const companion = themeCssVariables(COMPANION_THEME, "dark");
    for (const token of [
      "--reading-width",
      "--radius-md",
      "--font-sans",
      "--accent",
      "--bg",
    ])
      expect(canvas[token]).not.toBe(companion[token]);
  });

  it("keeps compact density legible and targets full-sized", () => {
    const compact = themeCssVariables(COMPANION_THEME, "dark", "compact");
    expect(compact["--row-pad"]).toBe("6px");
    expect(compact["--control-height"]).toBe("40px");
    expect(compact["--text-meta"]).toBe("12px");
  });

  it("rejects code, URLs, arbitrary layouts and undeclared manifest keys", () => {
    for (const change of [
      { layout: "javascript:alert(1)" },
      { css: "body{display:none}" },
      {
        typography: {
          ...COMPANION_THEME.typography,
          bodyFont: "url(https://evil.example/font)",
        },
      },
    ]) {
      expect(() =>
        parseThemeManifestV2({ ...COMPANION_THEME, ...change }),
      ).toThrow();
    }
    expect(() =>
      parseThemeManifestV2({
        ...COMPANION_THEME,
        colors: {
          ...COMPANION_THEME.colors,
          dark: {
            ...COMPANION_THEME.colors.dark,
            background: "url(file:///secret)",
          },
        },
      }),
    ).toThrow();
  });

  it("rejects low-contrast palettes even when structurally valid", () => {
    const bad = parseThemeManifestV2({
      ...COMPANION_THEME,
      colors: {
        ...COMPANION_THEME.colors,
        dark: { ...COMPANION_THEME.colors.dark, mutedText: "#222222" },
      },
    });
    expect(() => themeCssVariables(bad, "dark")).toThrow(/contrast/u);
  });

  it("enforces bounded JSON and preserves system appearance through round-trip", () => {
    const bundle = {
      kind: "doolittle.theme.bundle",
      version: 2,
      theme: CANVAS_THEME,
      appearance: "system",
      density: "comfortable",
    };
    expect(parseThemeBundleV2(JSON.stringify(bundle))).toEqual(bundle);
    expect(() => parseThemeBundleV2(" ".repeat(65537))).toThrow(/64 KB/u);
  });

  it("migrates v1 identity, palette, editor colors, appearance and density without mutation", () => {
    const legacy = {
      kind: "doolittle.theme" as const,
      version: 1 as const,
      theme: {
        name: "ember",
        label: "Ember",
        primary: "#D7263D",
        secondary: "#ff9900",
        cyanGlow: "#00ffaa",
        magentaGlow: "#cc77ff",
        muted: "#aabbcc",
        greenGlow: "#93FFB0",
        amberGlow: "#FFC857",
        panelBg: "#100d0d",
        baseFg: "#f9f6f1",
      },
      appearance: "system" as const,
      density: "compact" as const,
    };
    const source = JSON.stringify(legacy);
    const migrated = migrateLegacyThemeBundle(legacy);
    expect(migrated.theme.id).toBe("ember");
    expect(migrated.theme.colors.dark.accent).toBe("#d7263d");
    expect(migrated.theme.codeColors?.dark).toEqual({
      background: "#100d0d",
      text: "#f9f6f1",
    });
    expect(migrated.theme.terminalColors).toEqual({
      blue: "#d7263d",
      brightBlue: "#ff9900",
      cyan: "#00ffaa",
      magenta: "#cc77ff",
      muted: "#aabbcc",
    });
    expect(
      themeCssVariables(migrated.theme, "dark")["--terminal-bright-blue"],
    ).toBe("#ff9900");
    expect(migrated.appearance).toBe("system");
    expect(migrated.density).toBe("compact");
    expect(JSON.stringify(legacy)).toBe(source);
    expect(migrateLegacyThemeBundle(legacy)).toEqual(migrated);
  });

  it.each([
    ["#abc", "#aabbcc"],
    ["#123456ff", "#123456"],
    ["orange", "#ff7a00"],
    ["rgb(255, 0, 0)", "#ff0000"],
    ["rgba(100%, 0%, 0%, 100%)", "#ff0000"],
    ["hsl(120deg, 100%, 50%)", "#00ff00"],
    ["rgba(1,2,3,0.5)", undefined],
    ["url(javascript:alert(1))", undefined],
    ["#12345600", undefined],
    ["rgb(999,0,0)", undefined],
  ])("normalizes the safe legacy color %s", (source, expected) => {
    expect(legacyThemeColor(source)).toBe(expected);
  });
});
