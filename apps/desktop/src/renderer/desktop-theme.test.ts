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

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = [1, 3, 5].map(
      (offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255,
    );
    return channels
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      )
      .reduce(
        (total, channel, index) =>
          total + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0),
        0,
      );
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function mixSrgb(
  foreground: string,
  background: string,
  amount: number,
): string {
  const channels = [1, 3, 5].map((offset) =>
    Math.round(
      Number.parseInt(foreground.slice(offset, offset + 2), 16) * amount +
        Number.parseInt(background.slice(offset, offset + 2), 16) *
          (1 - amount),
    ),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function token(storage: ReadonlyMap<string, string>, name: string): string {
  const value = storage.get(`style:${name}`);
  if (!value) throw new Error(`Expected ${name} to be applied`);
  return value;
}

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

  it("uses density tokens for route headers, titles, cards, and controls", () => {
    applyDesktopDensity("comfortable");
    expect(storage.get("style:--page-pad-block")).toBe("22px 30px");
    expect(storage.get("style:--page-header-min-height")).toBe("64px");
    expect(storage.get("style:--page-title-size")).toBe(
      "clamp(22px, 2vw, 29px)",
    );
    expect(storage.get("style:--card-pad")).toBe("15px");
    expect(storage.get("style:--control-height")).toBe("32px");

    applyDesktopDensity("compact");
    expect(storage.get("style:--page-pad-block")).toBe("16px 22px");
    expect(storage.get("style:--page-header-min-height")).toBe("54px");
    expect(storage.get("style:--page-title-size")).toBe(
      "clamp(20px, 1.8vw, 25px)",
    );
    expect(storage.get("style:--card-pad")).toBe("11px");
    expect(storage.get("style:--control-height")).toBe("28px");
  });

  it("keeps representative small semantic text above 4.5:1 on its surfaces", () => {
    applyDesktopAppearance("dark");
    const dark = {
      faint: token(storage, "--faint"),
      muted: token(storage, "--muted"),
      accentText: token(storage, "--accent-text"),
      surfaceSoft: token(storage, "--surface-soft"),
      surfaceHover: token(storage, "--surface-hover"),
      accent: token(storage, "--accent"),
    };
    const darkSurfaces = [
      dark.surfaceSoft,
      dark.surfaceHover,
      mixSrgb(dark.accent, dark.surfaceHover, 0.07),
      mixSrgb(dark.accent, dark.surfaceSoft, 0.08),
    ];
    for (const surface of darkSurfaces) {
      expect(contrastRatio(dark.faint, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark.accentText, surface)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    expect(contrastRatio(dark.muted, dark.surfaceHover)).toBeGreaterThan(
      contrastRatio(dark.faint, dark.surfaceHover),
    );

    applyDesktopAppearance("light");
    const light = {
      faint: token(storage, "--faint"),
      muted: token(storage, "--muted"),
      accentText: token(storage, "--accent-text"),
      surfaceSoft: token(storage, "--surface-soft"),
      surfaceHover: token(storage, "--surface-hover"),
      accent: token(storage, "--accent"),
    };
    const lightSurfaces = [
      light.surfaceSoft,
      light.surfaceHover,
      mixSrgb(light.accent, light.surfaceHover, 0.07),
      mixSrgb(light.accent, light.surfaceSoft, 0.08),
    ];
    for (const surface of lightSurfaces) {
      expect(contrastRatio(light.faint, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(light.accentText, surface)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    expect(contrastRatio(light.muted, light.surfaceHover)).toBeGreaterThan(
      contrastRatio(light.faint, light.surfaceHover),
    );
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
