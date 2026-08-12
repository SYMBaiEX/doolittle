import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const experienceCss = readSource("./experience.css");
const shellOverlaysCss = readSource("./shell-overlays.css");
const mainSource = readSource("./main.tsx");
const appSource = readSource("./App.tsx");
const commandPaletteSource = readSource("./components/CommandPalette.tsx");
const routeDialogSource = readSource("./components/RouteControlDialog.tsx");
const shortcutHintSource = readSource("./components/ShortcutHint.tsx");

const exactClassSelector = (name: string) =>
  new RegExp(`\\.${name}(?![-\\w])`, "u");

const commandPaletteSelectors = [
  "command-palette",
  "command-palette__header",
  "command-palette__heading",
  "command-palette__mark",
  "command-palette__title",
  "command-palette__close",
  "command-palette__label",
  "command-palette__sr-only",
  "command-palette__search-shell",
  "command-palette__search-icon",
  "command-palette__search",
  "command-palette__scroll",
  "command-palette__list",
  "command-palette__group",
  "command-palette__group-label",
  "command-palette__item",
  "command-palette__item-label",
  "command-palette__item-description",
  "command-palette__item-shortcut",
  "command-palette__footer",
  "command-palette__key-guide",
  "command-palette__empty",
  "command-shortcut__key",
] as const;

const routeDialogSelectors = [
  "dialog-backdrop",
  "route-control-dialog",
  "route-control-header",
  "route-control-form",
  "route-control-status",
  "route-provider-grid",
  "route-provider-card",
  "route-provider-readiness",
  "route-control-actions",
] as const;

describe("desktop shell overlay CSS ownership", () => {
  it("keeps the command palette out of the initial renderer entry", () => {
    expect(appSource).not.toContain(
      'import { CommandPalette } from "./components/CommandPalette"',
    );
    expect(appSource).toContain('import("./components/CommandPalette")');
    expect(appSource).toContain("const LazyCommandPalette = lazy");
    expect(appSource).toMatch(
      /paletteMounted \? \(\s*<Suspense fallback=\{null\}>\s*<LazyCommandPalette/u,
    );
    expect(appSource).toContain("void preloadCommandPalette();");
    expect(appSource).toContain("setPaletteMounted(true);");
    expect(appSource).toContain("isOpen={paletteOpen}");
  });

  it("loads overlays immediately after the experience layer", () => {
    expect(mainSource).toContain(
      'import "./experience.css";\nimport "./shell-overlays.css";\nimport "./recovery.css";',
    );
  });

  it("keeps command and route dialog selectors out of experience.css", () => {
    for (const selector of [
      ...commandPaletteSelectors,
      ...routeDialogSelectors,
    ]) {
      expect(shellOverlaysCss).toMatch(exactClassSelector(selector));
      expect(experienceCss).not.toMatch(exactClassSelector(selector));
    }

    expect(experienceCss).not.toMatch(/command-menu-(?:in|out)/u);
    expect(experienceCss).not.toMatch(/(?:dialog-backdrop|route-control)-in/u);
    expect(shellOverlaysCss).not.toMatch(/\.chat[-_]/u);
  });

  it("keeps every moved selector reachable from its renderer", () => {
    for (const selector of commandPaletteSelectors) {
      const source =
        selector === "command-shortcut__key"
          ? shortcutHintSource
          : commandPaletteSource;
      expect(source).toContain(selector);
    }

    for (const selector of routeDialogSelectors) {
      expect(routeDialogSource).toContain(selector);
    }
  });

  it("retains the overlay-specific animation and responsive contracts", () => {
    expect(shellOverlaysCss).toContain("@keyframes command-menu-in");
    expect(shellOverlaysCss).toContain("@keyframes command-menu-out");
    expect(shellOverlaysCss).toContain("@keyframes dialog-backdrop-in");
    expect(shellOverlaysCss).toContain("@keyframes route-control-in");
    expect(shellOverlaysCss).toContain("@media (max-width: 760px)");
    expect(shellOverlaysCss).toContain(
      "@media (prefers-reduced-motion: reduce)",
    );
    expect(shellOverlaysCss).toContain('.command-palette[data-state="closed"]');
  });
});
