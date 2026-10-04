import { COMPANION_THEME } from "@doolittle/ui/themes";
import { describe, expect, it } from "vitest";
import {
  DESKTOP_THEME_BUNDLE_KIND,
  DESKTOP_THEME_BUNDLE_VERSION,
  DESKTOP_THEME_IMPORT_MAX_BYTES,
  desktopThemeBundleFilename,
  parseDesktopThemeBundle,
  serializeDesktopThemeBundle,
} from "./desktop-theme-transfer";

describe("desktop theme transfer", () => {
  it("round-trips a versioned palette, appearance, and density bundle", () => {
    const source = serializeDesktopThemeBundle(
      COMPANION_THEME,
      "dark",
      "compact",
    );

    expect(parseDesktopThemeBundle(source)).toEqual({
      kind: DESKTOP_THEME_BUNDLE_KIND,
      version: DESKTOP_THEME_BUNDLE_VERSION,
      theme: COMPANION_THEME,
      appearance: "dark",
      density: "compact",
    });
    expect(desktopThemeBundleFilename(COMPANION_THEME)).toBe(
      "companion.doolittle-theme.json",
    );
  });

  it("rejects unsupported, malformed, and oversized files", () => {
    expect(() => parseDesktopThemeBundle("not json")).toThrow("not valid JSON");
    expect(() =>
      parseDesktopThemeBundle(
        JSON.stringify({
          kind: "other.theme",
          version: 1,
          theme: COMPANION_THEME,
          appearance: "dark",
          density: "compact",
        }),
      ),
    ).toThrow("unsupported or invalid Doolittle theme format");
    expect(() =>
      parseDesktopThemeBundle("x".repeat(DESKTOP_THEME_IMPORT_MAX_BYTES + 1)),
    ).toThrow("64 KB or smaller");
  });

  it("rejects unrecognized executable-looking fields during serialization", () => {
    expect(() =>
      serializeDesktopThemeBundle(
        {
          ...COMPANION_THEME,
          css: "body { display: none }",
          script: "alert(1)",
        } as typeof COMPANION_THEME,
        "system",
        "comfortable",
      ),
    ).toThrow();
  });

  it("rejects unknown executable fields on imported v2 manifests", () => {
    const value = JSON.parse(
      serializeDesktopThemeBundle(COMPANION_THEME, "system", "comfortable"),
    );
    value.theme.css = "body { display: none }";
    expect(() => parseDesktopThemeBundle(JSON.stringify(value))).toThrow(
      "unsupported or invalid",
    );
  });

  it("migrates validated v1 imports into the v2 bundle", () => {
    const source = JSON.stringify({
      kind: "doolittle.theme",
      version: 1,
      theme: {
        name: "legacy",
        label: "Legacy",
        primary: "#ff6b16",
        secondary: "#ff9b5c",
        amberGlow: "#e7a84d",
        greenGlow: "#86b875",
      },
      appearance: "light",
      density: "compact",
    });
    expect(parseDesktopThemeBundle(source)).toMatchObject({
      kind: "doolittle.theme.bundle",
      version: 2,
      theme: { id: "legacy", name: "Legacy" },
      appearance: "light",
      density: "compact",
    });
  });
});
