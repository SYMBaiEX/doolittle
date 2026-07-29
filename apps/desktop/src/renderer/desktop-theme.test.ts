import { describe, expect, it } from "vitest";
import {
  parseDesktopThemeProfile,
  resolveAppearance,
  themeCssTokens,
} from "./desktop-theme";

describe("desktop theme", () => {
  it("sanitizes a runtime theme profile for renderer use", () => {
    expect(
      parseDesktopThemeProfile({
        name: "matrix",
        label: "Ghostline",
        tagline: "Terminal residue",
        primary: "#00FF66",
        secondary: "#7DFFB3",
        amberGlow: "#C4FF00",
        greenGlow: "#00FF66",
        ignored: "<script>",
      }),
    ).toEqual({
      name: "matrix",
      label: "Ghostline",
      tagline: "Terminal residue",
      primary: "#00FF66",
      secondary: "#7DFFB3",
      amberGlow: "#C4FF00",
      greenGlow: "#00FF66",
    });
  });

  it("rejects incomplete or unsafe profiles", () => {
    expect(parseDesktopThemeProfile(null)).toBeNull();
    expect(
      parseDesktopThemeProfile({
        name: "broken",
        label: "Broken",
        primary: "url(javascript:alert(1))",
      }),
    ).toBeNull();
  });

  it("derives live CSS tokens from the selected palette", () => {
    const profile = parseDesktopThemeProfile({
      name: "ember",
      label: "Crimson Forge",
      primary: "#D7263D",
      secondary: "#FF6B6B",
      amberGlow: "#FFC857",
      greenGlow: "#93FFB0",
    });
    expect(profile).not.toBeNull();
    if (!profile) throw new Error("Expected a valid theme profile");
    expect(themeCssTokens(profile)).toMatchObject({
      "--accent": "#D7263D",
      "--accent-ink": "#fffaf5",
      "--accent-hover": "#FF6B6B",
      "--good": "#93FFB0",
      "--warn": "#FFC857",
    });
  });

  it("keeps high-luminance accents readable with dark ink", () => {
    const profile = parseDesktopThemeProfile({
      name: "toxic",
      label: "Acid Burn",
      primary: "#B8FF00",
      secondary: "#F0FF66",
      amberGlow: "#FFD24D",
      greenGlow: "#B8FF00",
    });
    expect(profile).not.toBeNull();
    if (!profile) throw new Error("Expected a valid theme profile");
    expect(themeCssTokens(profile)["--accent-ink"]).toBe("#160b03");
  });

  it("resolves system appearance without changing the saved preference", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");
  });
});
