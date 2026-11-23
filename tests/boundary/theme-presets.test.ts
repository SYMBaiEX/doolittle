import { expect, it } from "vitest";
import {
  getReadableTextColor,
  getTuiTheme,
  listTuiThemes,
} from "../../packages/agent/src/runtime/theme-catalog";
import { parseThemeManifestV2 } from "../../packages/contracts/src/theme";
import {
  composeThemeManifest,
  splitThemeSelection,
  themeSelectionId,
} from "../../packages/ui/src/theme-colors";
import {
  BUILT_IN_THEMES,
  CANVAS_THEME,
  legacyThemeColor,
  themeContrast,
  themeCssVariables,
  validateThemeAccessibility,
} from "../../packages/ui/src/themes";

it.each(BUILT_IN_THEMES)(
  "keeps $name readable in both appearances and densities",
  (theme) => {
    expect(() => validateThemeAccessibility(theme)).not.toThrow();
    for (const appearance of ["light", "dark"] as const) {
      for (const density of ["compact", "comfortable"] as const) {
        const tokens = themeCssVariables(theme, appearance, density);
        expect(tokens["--bg"]).toBe(theme.colors[appearance].background);
        expect(
          themeContrast(tokens["--text"], tokens["--bg"]),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          Number.parseInt(tokens["--text-conversation"], 10),
        ).toBeGreaterThanOrEqual(16);
        expect(
          Number.parseInt(tokens["--touch-height"], 10),
        ).toBeGreaterThanOrEqual(44);
      }
    }
    expect(parseThemeManifestV2(JSON.parse(JSON.stringify(theme)))).toEqual(
      theme,
    );
  },
);

it("limits imported materials to declarative built-in treatments", () => {
  expect(() =>
    parseThemeManifestV2({
      ...BUILT_IN_THEMES[0],
      material: "url(https://example.com/tracker)",
    }),
  ).toThrow();
  expect(
    parseThemeManifestV2({ ...BUILT_IN_THEMES[0], material: undefined })
      .material,
  ).toBeUndefined();
});

it("only reads supported names when migrating legacy colors", () => {
  expect(legacyThemeColor(" BLUE ")).toBe("#4f7cff");
  expect(legacyThemeColor("constructor")).toBeUndefined();
  expect(legacyThemeColor("__proto__")).toBeUndefined();
});

it("composes a color overlay onto a layout theme for both appearances", () => {
  const composed = composeThemeManifest(CANVAS_THEME, {
    name: "obsidian",
    label: "Null Glass",
    dark: { accent: "#8d99ae" },
    light: { accent: "#3d4c63" },
  });
  expect(composed.id).toBe("canvas.obsidian");
  expect(composed.name).toBe("Canvas + Null Glass");
  expect(composed.layout).toBe("canvas");
  expect(composed.geometry).toEqual(CANVAS_THEME.geometry);
  expect(composed.colors.dark.accent).toBe("#8d99ae");
  expect(composed.colors.light.accent).toBe("#3d4c63");
  // Untouched palette fields keep the base theme's values.
  expect(composed.colors.dark.background).toBe(
    CANVAS_THEME.colors.dark.background,
  );
  expect(() => validateThemeAccessibility(composed)).not.toThrow();
  // Recomposing replaces the color suffix instead of stacking identities.
  const recomposed = composeThemeManifest(composed, {
    name: "ember",
    dark: { accent: "#d7263d" },
  });
  expect(recomposed.id).toBe("canvas.ember");
});

it("round-trips selection identities and falls back on invalid names", () => {
  expect(themeSelectionId("canvas", "blue-static")).toBe("canvas.blue-static");
  // Names outside the manifest id alphabet keep the bare layout id.
  expect(themeSelectionId("canvas", "Blue Static")).toBe("canvas");
  expect(themeSelectionId("canvas", " ")).toBe("canvas");
  expect(splitThemeSelection("canvas.blue-static")).toEqual({
    theme: "canvas",
    color: "blue-static",
  });
  expect(splitThemeSelection("golden-gate-glass")).toEqual({
    theme: "golden-gate-glass",
    color: null,
  });
  expect(splitThemeSelection("obsidian")).toEqual({
    theme: "obsidian",
    color: null,
  });
});

it("offers matching CLI palettes and keeps terminal header text readable", () => {
  expect(getTuiTheme("anime").name).toBe("anime-atelier");
  expect(getTuiTheme("manga").name).toBe("anime-atelier");
  expect(getTuiTheme("glass").name).toBe("obsidian");
  expect(getTuiTheme("golden-gate").name).toBe("golden-gate-glass");
  for (const summary of listTuiThemes()) {
    const profile = getTuiTheme(summary.name);
    const text =
      getReadableTextColor(profile.primary) === "white" ? "#ffffff" : "#000000";
    expect(themeContrast(text, profile.primary)).toBeGreaterThanOrEqual(4.5);
  }
  expect(getReadableTextColor("#f80")).toBe("black");
  expect(getReadableTextColor("#ggg")).toBe("white");
});
