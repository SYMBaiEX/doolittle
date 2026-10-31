// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  announceAppearance,
  announceDensity,
  applyThemeManifest,
  DENSITY_STORAGE_KEY,
  loadStoredThemeManifest,
} from "../../apps/desktop/src/renderer/desktop-theme";
import {
  ANIME_ATELIER_THEME,
  COMPANION_THEME,
  GOLDEN_GATE_GLASS_THEME,
} from "../../packages/ui/src/themes";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../apps/desktop/src/renderer/lib", () => ({
  desktopRequest: request,
}));
vi.mock("@elizaos/ui/hooks/useMediaQuery", () => ({
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
