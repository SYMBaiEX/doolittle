import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMMAND_PALETTE_LOADING_BACKDROP_CLASS,
  COMMAND_PALETTE_LOADING_STATUS_CLASS,
} from "./app-shell/command-palette-loading-layout";
import {
  COMMAND_PALETTE_CLASS,
  COMMAND_PALETTE_ITEM_CLASS,
  ROUTE_DIALOG_BACKDROP_CLASS,
  ROUTE_DIALOG_CLASS,
  ROUTE_PROVIDER_CARD_CLASS,
} from "./app-shell/overlay-layout";

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const mainSource = readSource("./main.tsx");
const appSource = readSource("./App.tsx");
const commandPaletteSource = readSource("./components/CommandPalette.tsx");
const routeDialogSource = readSource("./components/RouteControlDialog.tsx");
const shortcutHintSource = readSource("./components/ShortcutHint.tsx");

describe("desktop shell overlay Tailwind ownership", () => {
  it("keeps the command palette out of the initial renderer entry", () => {
    expect(appSource).not.toContain(
      'import { CommandPalette } from "./components/CommandPalette"',
    );
    expect(appSource).toContain('import("./components/CommandPalette")');
    expect(appSource).toContain("const LazyCommandPalette = lazy");
    expect(appSource).toMatch(
      /paletteMounted \? \(\s*<Suspense\s+fallback=\{/u,
    );
    expect(appSource).toContain("<CommandPaletteLoadingFallback");
    expect(appSource).toContain("void preloadCommandPalette();");
    expect(appSource).toContain("setPaletteMounted(true);");
    expect(appSource).toContain("isOpen={paletteOpen}");
    expect(appSource).toContain(
      "returnFocusTarget={paletteReturnFocusRef.current}",
    );
  });

  it("uses Tailwind contracts for the loading fallback", () => {
    expect(COMMAND_PALETTE_LOADING_BACKDROP_CLASS).toContain("fixed inset-0");
    expect(COMMAND_PALETTE_LOADING_BACKDROP_CLASS).toContain(
      "place-items-center",
    );
    expect(COMMAND_PALETTE_LOADING_STATUS_CLASS).toContain("animate-pulse");
    expect(COMMAND_PALETTE_LOADING_STATUS_CLASS).toContain("motion-reduce:");
    expect(appSource).toContain("COMMAND_PALETTE_LOADING_BACKDROP_CLASS");
    expect(appSource).toContain('aria-modal="true"');
    expect(appSource).toContain('role="dialog"');
    expect(appSource).toContain('role="status"');
    expect(appSource).toContain('event.key === "Escape"');
  });

  it("owns palette and route dialog layout without a stylesheet", () => {
    expect(mainSource).not.toContain('import "./shell-overlays.css"');
    expect(COMMAND_PALETTE_CLASS).toContain("w-[min(620px,calc(100vw-32px))]");
    expect(COMMAND_PALETTE_ITEM_CLASS).toContain("aria-selected:");
    expect(ROUTE_DIALOG_BACKDROP_CLASS).toContain("max-[760px]:items-end");
    expect(ROUTE_DIALOG_CLASS).toContain("max-[760px]:max-h-");
    expect(ROUTE_PROVIDER_CARD_CLASS).toContain("hover:-translate-y-px");
  });

  it("keeps semantic selectors reachable from renderer markup", () => {
    for (const contract of [
      "COMMAND_PALETTE_CLASS",
      "COMMAND_PALETTE_HEADER_CLASS",
      "COMMAND_PALETTE_ITEM_CLASS",
      "COMMAND_PALETTE_FOOTER_CLASS",
    ]) {
      expect(commandPaletteSource).toContain(contract);
    }
    expect(shortcutHintSource).toContain("COMMAND_SHORTCUT_KEY_CLASS");
    for (const contract of [
      "ROUTE_DIALOG_BACKDROP_CLASS",
      "ROUTE_DIALOG_CLASS",
      "ROUTE_PROVIDER_CARD_CLASS",
      "ROUTE_DIALOG_ACTIONS_CLASS",
    ]) {
      expect(routeDialogSource).toContain(contract);
    }
  });
});
