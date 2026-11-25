// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  announceAppearance,
  announceDensity,
  applyDesktopTheme,
  applyThemeManifest,
  clearThemeColorSelection,
  DENSITY_STORAGE_KEY,
  type DesktopThemeProfile,
  getActiveColorName,
  loadStoredThemeManifest,
  loadThemeColorSelection,
  selectDesktopTheme,
  THEME_TRANSITION_ATTRIBUTE,
  THEME_V2_STORAGE_KEY,
} from "../../apps/desktop/src/renderer/desktop-theme";
import {
  ANIME_ATELIER_THEME,
  CANVAS_THEME,
  COMPANION_THEME,
  GOLDEN_GATE_GLASS_THEME,
} from "../../packages/ui/src/themes";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../apps/desktop/src/renderer/lib", () => ({
  desktopRequest: request,
}));
vi.mock("../../packages/ui/src/environment", () => ({
  useMediaQuery: () => false,
}));

import { useDesktopAppearance } from "../../apps/desktop/src/renderer/use-desktop-appearance";

let root: Root;
let container: HTMLDivElement;
let appearance: ReturnType<typeof useDesktopAppearance>;
function Probe() {
  appearance = useDesktopAppearance("stopped");
  return null;
}
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  request.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

it("restores preferences and synchronizes changes from settings and the shell", () => {
  localStorage.setItem(APPEARANCE_STORAGE_KEY, "system");
  localStorage.setItem(DENSITY_STORAGE_KEY, "compact");
  act(() => root.render(createElement(Probe)));
  expect(appearance.resolvedAppearance).toBe("light");
  expect(document.documentElement.dataset.appearance).toBe("light");
  expect(document.documentElement.dataset.density).toBe("compact");
  expect(request).not.toHaveBeenCalled();
  act(() => {
    announceAppearance("dark");
    announceDensity("comfortable");
  });
  expect(appearance.resolvedAppearance).toBe("dark");
  expect(document.documentElement.dataset.appearance).toBe("dark");
  expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBe("comfortable");
  act(() => appearance.setAppearance("light"));
  expect(document.documentElement.dataset.appearance).toBe("light");
  expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("light");
});

it("persists expressive themes across appearance changes and clears their material on return", () => {
  act(() => root.render(createElement(Probe)));
  for (const theme of [ANIME_ATELIER_THEME, GOLDEN_GATE_GLASS_THEME]) {
    act(() => applyThemeManifest(theme, "builtin"));
    expect(document.documentElement.dataset.uiMaterial).toBe(theme.material);
    act(() => announceAppearance("light"));
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(
      theme.colors.light.background,
    );
    expect(loadStoredThemeManifest()).toEqual(theme);
    act(() => announceAppearance("dark"));
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(
      theme.colors.dark.background,
    );
  }
  act(() => applyThemeManifest(COMPANION_THEME, "builtin"));
  expect(document.documentElement.dataset.uiMaterial).toBe("flat");
});

const OBSIDIAN_PROFILE: DesktopThemeProfile = {
  name: "obsidian",
  label: "Null Glass",
  tagline: "Dark chrome for minimal interference.",
  primary: "#8D99AE",
  secondary: "#C9D6EA",
  amberGlow: "#E7C76B",
  cyanGlow: "#7EE0FF",
  greenGlow: "#8CFFB5",
  magentaGlow: "#D78EFF",
  muted: "gray",
  baseBg: "black",
  baseFg: "white",
  panelBg: "black",
};

const EMBER_PROFILE: DesktopThemeProfile = {
  name: "ember",
  label: "Crimson Forge",
  tagline: "Redline pressure with a sharper, hotter pulse.",
  primary: "#D7263D",
  secondary: "#FF6B6B",
  amberGlow: "#FFC857",
  cyanGlow: "#63E6FF",
  greenGlow: "#93FFB0",
  magentaGlow: "#FF7DE8",
  muted: "gray",
  baseBg: "black",
  baseFg: "white",
  panelBg: "black",
};

it("composes a runtime color onto the active layout theme", () => {
  act(() => root.render(createElement(Probe)));
  act(() => applyThemeManifest(CANVAS_THEME, "builtin"));
  let manifest!: ReturnType<typeof applyDesktopTheme>;
  act(() => {
    manifest = applyDesktopTheme(OBSIDIAN_PROFILE, "runtime");
  });
  expect(manifest.id).toBe("canvas.obsidian");
  expect(manifest.layout).toBe("canvas");
  expect(manifest.name).toBe("Canvas + Null Glass");
  expect(manifest.geometry).toEqual(CANVAS_THEME.geometry);
  // The layout keeps its surfaces; the color owns accent and status colors.
  expect(manifest.colors.dark.background).toBe(
    CANVAS_THEME.colors.dark.background,
  );
  expect(manifest.colors.dark.accent).toBe("#8d99ae");
  expect(manifest.colors.light.accent).toBe("#8d99ae");
  expect(document.documentElement.dataset.theme).toBe("canvas.obsidian");
  expect(document.documentElement.dataset.uiLayout).toBe("canvas");
  expect(getActiveColorName()).toBe("obsidian");
  expect(loadThemeColorSelection()?.color.name).toBe("obsidian");
  // Reloading recomposes the same pair.
  expect(loadStoredThemeManifest()).toEqual(manifest);
});

it("keeps the chosen palette when switching layout themes", () => {
  act(() => root.render(createElement(Probe)));
  act(() => applyThemeManifest(CANVAS_THEME, "builtin"));
  act(() => applyDesktopTheme(EMBER_PROFILE, "runtime"));
  let manifest!: ReturnType<typeof selectDesktopTheme>;
  act(() => {
    manifest = selectDesktopTheme(GOLDEN_GATE_GLASS_THEME);
  });
  expect(manifest.id).toBe("golden-gate-glass.ember");
  expect(manifest.material).toBe("glass");
  expect(manifest.colors.dark.accent).toBe("#d7263d");
  expect(manifest.colors.dark.background).toBe(
    GOLDEN_GATE_GLASS_THEME.colors.dark.background,
  );
  expect(getActiveColorName()).toBe("ember");
});

it("recolors from a pristine base so palettes never tint on tint", () => {
  act(() => root.render(createElement(Probe)));
  act(() => applyThemeManifest(CANVAS_THEME, "builtin"));
  act(() => applyDesktopTheme(OBSIDIAN_PROFILE, "runtime"));
  let manifest!: ReturnType<typeof applyDesktopTheme>;
  act(() => {
    manifest = applyDesktopTheme(EMBER_PROFILE, "runtime");
  });
  expect(manifest.id).toBe("canvas.ember");
  expect(manifest.colors.dark.accent).toBe("#d7263d");
  expect(manifest.colors.dark.background).toBe(
    CANVAS_THEME.colors.dark.background,
  );
  expect(loadThemeColorSelection()?.color.name).toBe("ember");
});

it("restores the layout's own colors when the color selection clears", () => {
  act(() => root.render(createElement(Probe)));
  act(() => applyThemeManifest(CANVAS_THEME, "builtin"));
  act(() => applyDesktopTheme(OBSIDIAN_PROFILE, "runtime"));
  let manifest!: ReturnType<typeof clearThemeColorSelection>;
  act(() => {
    manifest = clearThemeColorSelection();
  });
  expect(manifest).toEqual(CANVAS_THEME);
  expect(loadThemeColorSelection()).toBeNull();
  expect(getActiveColorName()).toBeNull();
  expect(document.documentElement.dataset.theme).toBe("canvas");
});

it("ignores rebroadcasts of the active color but composes new ones", () => {
  act(() => root.render(createElement(Probe)));
  act(() => applyThemeManifest(CANVAS_THEME, "builtin"));
  act(() => applyDesktopTheme(OBSIDIAN_PROFILE, "runtime"));
  const before = localStorage.getItem(THEME_V2_STORAGE_KEY);
  act(() => applyDesktopTheme(OBSIDIAN_PROFILE));
  expect(localStorage.getItem(THEME_V2_STORAGE_KEY)).toBe(before);
  act(() => applyDesktopTheme(EMBER_PROFILE));
  expect(loadStoredThemeManifest().id).toBe("canvas.ember");
});

for (const theme of [ANIME_ATELIER_THEME, GOLDEN_GATE_GLASS_THEME]) {
  const previous = {
    ...theme,
    description: "Previously saved preset",
    colors: {
      ...theme.colors,
      dark: {
        ...theme.colors.dark,
        accent: theme.material === "cel" ? "#f38aaf" : "#ff9a73",
      },
    },
  };
  it(`updates a saved built-in ${theme.name} selection to its current design`, () => {
    applyThemeManifest(previous, "builtin");
    expect(
      JSON.parse(localStorage.getItem(THEME_V2_STORAGE_KEY) ?? "{}")
        .description,
    ).toBe("Previously saved preset");
    expect(loadStoredThemeManifest()).toEqual(theme);
  });
  it(`preserves imported customization with the ${theme.name} identifier`, () => {
    applyThemeManifest(previous, "imported");
    expect(loadStoredThemeManifest()).toEqual(previous);
  });
}

it("eases later theme applies through a short transition window", async () => {
  delete document.documentElement.dataset.themeTransition;
  vi.resetModules();
  const { applyThemeManifest: applyFresh } = await import(
    "../../apps/desktop/src/renderer/desktop-theme"
  );
  vi.useFakeTimers();
  try {
    // The first apply seeds the palette before the UI mounts and stays instant.
    applyFresh(COMPANION_THEME, "builtin");
    expect(
      document.documentElement.hasAttribute(THEME_TRANSITION_ATTRIBUTE),
    ).toBe(false);
    applyFresh(CANVAS_THEME, "builtin");
    expect(
      document.documentElement.hasAttribute(THEME_TRANSITION_ATTRIBUTE),
    ).toBe(true);
    // Rapid consecutive applies re-arm one window rather than stacking.
    applyFresh(COMPANION_THEME, "builtin");
    vi.advanceTimersByTime(500);
    expect(
      document.documentElement.hasAttribute(THEME_TRANSITION_ATTRIBUTE),
    ).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

it("opens the transition window for later appearance and density changes", async () => {
  delete document.documentElement.dataset.themeTransition;
  vi.resetModules();
  const {
    applyDesktopAppearance: applyAppearance,
    applyDesktopDensity: applyDensity,
  } = await import("../../apps/desktop/src/renderer/desktop-theme");
  vi.useFakeTimers();
  try {
    applyAppearance("dark", true);
    applyDensity("comfortable");
    expect(
      document.documentElement.hasAttribute(THEME_TRANSITION_ATTRIBUTE),
    ).toBe(false);
    applyAppearance("light", false);
    expect(
      document.documentElement.hasAttribute(THEME_TRANSITION_ATTRIBUTE),
    ).toBe(true);
    vi.advanceTimersByTime(500);
    applyDensity("compact");
    expect(
      document.documentElement.hasAttribute(THEME_TRANSITION_ATTRIBUTE),
    ).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it("never opens the transition window under reduced motion or forced colors", async () => {
  delete document.documentElement.dataset.themeTransition;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") || query.includes("forced-colors"),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
  vi.resetModules();
  try {
    const {
      applyThemeManifest: applyFresh,
      applyDesktopAppearance: applyAppearance,
    } = await import("../../apps/desktop/src/renderer/desktop-theme");
    applyFresh(COMPANION_THEME, "builtin");
    applyFresh(CANVAS_THEME, "builtin");
    applyAppearance("dark", true);
    applyAppearance("light", false);
    expect(
      document.documentElement.hasAttribute(THEME_TRANSITION_ATTRIBUTE),
    ).toBe(false);
  } finally {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.themeTransition;
  }
});

it("keeps text color out of the theme transition so the sweep stays paintable", () => {
  // Measured in the running desktop app: easing the `color` property forces
  // every text run in the window to re-rasterize on every frame of the sweep,
  // collapsing frame production to a slideshow for exactly the transition's
  // duration — light/dark and color flips read as a snap instead of a fade.
  // Surface paints (backgrounds, borders, shadows) are cheap to interpolate
  // and stay; text flips with the tokens.
  const css = readFileSync(
    resolve("apps/desktop/src/renderer/theme-materials.css"),
    "utf8",
  );
  const transitionBlock = css.match(
    /\[data-theme-transition\][\s\S]*?transition:([\s\S]*?)!important;/u,
  );
  expect(transitionBlock).not.toBeNull();
  const properties = transitionBlock?.[1] ?? "";
  expect(properties).toContain("background-color");
  expect(properties).not.toMatch(/(?:^|[\s,])color\s+var\(/u);
});
