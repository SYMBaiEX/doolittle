// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DesktopThemeProfile } from "../../apps/desktop/src/renderer/desktop-theme";
import { SettingsAppearancePanel } from "../../apps/desktop/src/renderer/settings/SettingsAppearancePanel";

let container: HTMLDivElement;
let root: Root;

const MANIFEST = {
  colors: {
    dark: {
      accent: "#ff6b16",
      accentHover: "#ff833f",
      background: "#0b0b0a",
      borderStrong: "#3a3630",
      mutedText: "#a0988f",
      navigation: "#10100f",
      secondaryText: "#c9c3b9",
    },
  },
};

const INTERFACE_THEMES = [
  {
    id: "companion",
    name: "Companion",
    description: "Warm, quiet conversations.",
    ...MANIFEST,
  },
  {
    id: "canvas",
    name: "Canvas",
    description: "A spacious working canvas.",
    ...MANIFEST,
  },
];

const COLOR_THEMES = [
  {
    name: "obsidian",
    label: "Obsidian",
    tagline: "Dark slate",
    primary: "#1b1e2e",
    secondary: "#5b6ee1",
  },
  {
    name: "dracula",
    label: "Dracula",
    tagline: "Vampire palette",
    primary: "#bd93f9",
    secondary: "#ff79c6",
  },
];

const OBSIDIAN_PROFILE: DesktopThemeProfile = {
  name: "obsidian",
  label: "Obsidian",
  tagline: "Dark slate",
  primary: "#1b1e2e",
  secondary: "#5b6ee1",
  amberGlow: "#e7a84d",
  greenGlow: "#86b875",
};

function renderPanel(props?: {
  active?: boolean;
  activeTheme?: DesktopThemeProfile | null;
  onThemeChange?: (theme: string) => void;
  themes?: unknown[];
}) {
  const themes = props?.themes ?? [...INTERFACE_THEMES, ...COLOR_THEMES];
  act(() =>
    root.render(
      <SettingsAppearancePanel
        active={props?.active ?? true}
        activeTheme={props?.activeTheme ?? null}
        appearance="dark"
        density="comfortable"
        localThemeIds={INTERFACE_THEMES.map((theme) => theme.id)}
        onAppearanceChange={() => {}}
        onDensityChange={() => {}}
        onThemeChange={props?.onThemeChange ?? (() => {})}
        onThemeExport={() => {}}
        onThemeImport={() => {}}
        themes={themes}
      />,
    ),
  );
}

const headings = () =>
  Array.from(
    container.querySelectorAll(".dl-settings-theme-heading strong"),
    (node) => node.textContent,
  );

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

it("splits interface manifests from runtime color themes", () => {
  renderPanel();
  expect(headings()).toEqual(["Themes", "Colors"]);
  const themeCards = container.querySelectorAll(
    ".settings-workbench-themes .dl-settings-theme-choice",
  );
  expect(themeCards.length).toBe(INTERFACE_THEMES.length);
  expect(
    container.querySelectorAll(".settings-workbench-themes .dl-theme-preview")
      .length,
  ).toBe(INTERFACE_THEMES.length);
  const swatches = container.querySelectorAll(
    ".settings-workbench-colors .dl-settings-theme-choice",
  );
  expect(swatches.length).toBe(COLOR_THEMES.length);
  expect(
    container.querySelectorAll(".settings-workbench-colors .dl-color-swatch")
      .length,
  ).toBe(COLOR_THEMES.length);
});

it("marks the runtime color palette selected and routes its name to the same change handler", () => {
  const onThemeChange = vi.fn();
  renderPanel({ activeTheme: OBSIDIAN_PROFILE, onThemeChange });
  const obsidian = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Obsidian: Dark slate"]',
  );
  expect(obsidian?.getAttribute("aria-pressed")).toBe("true");
  const companion = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Companion: Warm, quiet conversations."]',
  );
  expect(companion?.getAttribute("aria-pressed")).toBe("false");
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Dracula: Vampire palette"]',
      )
      ?.click(),
  );
  expect(onThemeChange).toHaveBeenCalledExactlyOnceWith("dracula");
});

it("keeps interface themes usable offline while runtime colors stay disabled", () => {
  renderPanel({ active: false });
  expect(headings()).toEqual(["Themes", "Colors"]);
  for (const button of container.querySelectorAll<HTMLButtonElement>(
    ".settings-workbench-colors .dl-settings-theme-choice",
  )) {
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Start the runtime to apply this theme");
  }
  for (const button of container.querySelectorAll<HTMLButtonElement>(
    ".settings-workbench-themes .dl-settings-theme-choice",
  )) {
    expect(button.disabled).toBe(false);
  }
});

it("hides the colors subsection when no runtime palettes are available offline", () => {
  renderPanel({ active: false, themes: INTERFACE_THEMES });
  expect(headings()).toEqual(["Themes"]);
  expect(container.querySelector(".settings-workbench-colors")).toBeNull();
});

it("shows the empty state inside the colors subsection when the catalog is bare", () => {
  renderPanel({ themes: INTERFACE_THEMES });
  expect(headings()).toEqual(["Themes", "Colors"]);
  expect(container.textContent).toContain("No color themes are available");
});
