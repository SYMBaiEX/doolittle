import { describe, expect, it } from "vitest";
import {
  DESKTOP_THEME_BUNDLE_KIND,
  DESKTOP_THEME_BUNDLE_VERSION,
  DESKTOP_THEME_IMPORT_MAX_BYTES,
  desktopThemeBundleFilename,
  parseDesktopThemeBundle,
  serializeDesktopThemeBundle,
} from "./desktop-theme-transfer";

const sharedTheme = {
  name: "midnight-grid",
  label: "Midnight Grid",
  tagline: "A shared operator palette.",
  primary: "#7c3aed",
  secondary: "#22d3ee",
  amberGlow: "#f59e0b",
  greenGlow: "#22c55e",
  cyanGlow: "#22d3ee",
  magentaGlow: "#d946ef",
  muted: "#64748b",
  baseBg: "#020617",
  baseFg: "#f8fafc",
  panelBg: "#0f172a",
};

describe("desktop theme transfer", () => {
  it("round-trips a versioned palette, appearance, and density bundle", () => {
    const source = serializeDesktopThemeBundle(sharedTheme, "dark", "compact");

    expect(parseDesktopThemeBundle(source)).toEqual({
      kind: DESKTOP_THEME_BUNDLE_KIND,
      version: DESKTOP_THEME_BUNDLE_VERSION,
      theme: sharedTheme,
      appearance: "dark",
      density: "compact",
    });
    expect(desktopThemeBundleFilename(sharedTheme)).toBe(
      "midnight-grid.doolittle-theme.json",
    );
  });

  it("rejects unsupported, malformed, and oversized files", () => {
    expect(() => parseDesktopThemeBundle("not json")).toThrow("not valid JSON");
    expect(() =>
      parseDesktopThemeBundle(
        JSON.stringify({
          kind: "other.theme",
          version: 1,
          theme: sharedTheme,
          appearance: "dark",
          density: "compact",
        }),
      ),
    ).toThrow("unsupported Doolittle theme format");
    expect(() =>
      parseDesktopThemeBundle("x".repeat(DESKTOP_THEME_IMPORT_MAX_BYTES + 1)),
    ).toThrow("64 KB or smaller");
  });

  it("drops unrecognized executable-looking fields during serialization", () => {
    const source = serializeDesktopThemeBundle(
      {
        ...sharedTheme,
        css: "body { display: none }",
        script: "alert(1)",
      } as typeof sharedTheme,
      "system",
      "comfortable",
    );

    expect(source).not.toContain('"css"');
    expect(source).not.toContain('"script"');
    expect(parseDesktopThemeBundle(source).appearance).toBe("system");
  });
});
