import { expect, it } from "vitest";
import {
  getReadableTextColor,
  getTuiTheme,
  listTuiThemes,
} from "../../packages/agent/src/runtime/theme-catalog";
import { parseThemeManifestV2 } from "../../packages/contracts/src/theme";
import {
  BUILT_IN_THEMES,
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

it("offers matching CLI palettes and keeps terminal header text readable", () => {
  expect(getTuiTheme("anime").name).toBe("anime-atelier");
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
