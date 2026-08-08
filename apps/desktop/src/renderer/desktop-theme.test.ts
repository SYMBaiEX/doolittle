import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_CHANGE_EVENT,
  applyDesktopAppearance,
  applyDesktopDensity,
  applyDesktopTheme,
  DENSITY_CHANGE_EVENT,
  parseDesktopThemeProfile,
  resolveAppearance,
  subscribeToDesktopThemeChanges,
  THEME_CHANGE_EVENT,
  themeCssTokens,
} from "./desktop-theme";

describe("desktop theme", () => {
  let storage: Map<string, string>;
  let root: {
    dataset: Record<string, string>;
    classList: {
      contains: (token: string) => boolean;
      toggle: (token: string, force?: boolean) => boolean;
    };
    style: { setProperty: (property: string, value: string) => void };
  };

  beforeEach(() => {
    storage = new Map();
    const classes = new Set<string>();
    root = {
      dataset: {},
      classList: {
        contains: (token) => classes.has(token),
        toggle: (token, force) => {
          const enabled = force ?? !classes.has(token);
          if (enabled) classes.add(token);
          else classes.delete(token);
          return enabled;
        },
      },
      style: {
        setProperty: (property, value) =>
          storage.set(`style:${property}`, value),
      },
    };
    const events = new EventTarget();
    vi.stubGlobal(
      "window",
      Object.assign(events, {
        matchMedia: () => ({ matches: false }),
      }),
    );
    vi.stubGlobal("document", { documentElement: root });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("applies appearance, density, and palette tokens to the root shell immediately", () => {
    const profile = parseDesktopThemeProfile({
      name: "ember",
      label: "Crimson Forge",
      primary: "#D7263D",
      secondary: "#FF6B6B",
      amberGlow: "#FFC857",
      greenGlow: "#93FFB0",
    });
    if (!profile) throw new Error("Expected a valid theme profile");

    applyDesktopAppearance("system", true);
    applyDesktopDensity("compact");
    applyDesktopTheme(profile);

    expect(root.dataset).toMatchObject({
      appearance: "dark",
      appearancePreference: "system",
      density: "compact",
      theme: "ember",
    });
    expect(storage.get("doolittle.desktop.appearance")).toBe("system");
    expect(root.classList.contains("dark")).toBe(true);
    applyDesktopAppearance("light", true);
    expect(root.classList.contains("dark")).toBe(false);
    expect(storage.get("doolittle.desktop.density")).toBe("compact");
    expect(storage.get("doolittle.desktop.theme")).toBe(
      JSON.stringify(profile),
    );
    expect(storage.get("style:--accent")).toBe("#D7263D");
  });

  it("forwards valid changes once and removes its window subscriptions", () => {
    const changes: string[] = [];
    const unsubscribe = subscribeToDesktopThemeChanges({
      onAppearance: (value) => changes.push(`appearance:${value}`),
      onDensity: (value) => changes.push(`density:${value}`),
      onTheme: (value) => changes.push(`theme:${value.name}`),
    });
    const dispatch = (type: string, detail: unknown) => {
      const event = new Event(type);
      Object.defineProperty(event, "detail", { value: detail });
      window.dispatchEvent(event);
    };

    dispatch(APPEARANCE_CHANGE_EVENT, "light");
    dispatch(DENSITY_CHANGE_EVENT, "compact");
    dispatch(THEME_CHANGE_EVENT, {
      name: "ember",
      label: "Crimson Forge",
      primary: "#D7263D",
    });
    unsubscribe();
    dispatch(APPEARANCE_CHANGE_EVENT, "dark");
    dispatch(DENSITY_CHANGE_EVENT, "comfortable");

    expect(changes).toEqual([
      "appearance:light",
      "density:compact",
      "theme:ember",
    ]);
  });
});
