import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  "apps/desktop/src/renderer/app-shell/floating-layers.css",
  "utf8",
);

function layerValue(name: string): number {
  const match = css.match(new RegExp(`--dl-z-layer-${name}:\\s*(\\d+)`));
  expect(match, `missing --dl-z-layer-${name}`).not.toBeNull();
  return Number(match?.[1]);
}

function ruleUsesLayer(selector: string, name: string): void {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  expect(css, `${selector} must use --dl-z-layer-${name}`).toMatch(
    new RegExp(
      `${escaped}\\s*\\{[^}]*z-index:\\s*var\\(--dl-z-layer-${name}\\)`,
    ),
  );
}

describe("desktop floating-layer contract", () => {
  it("keeps portaled controls above app-owned modal and command surfaces", () => {
    expect(layerValue("workspace-fullscreen")).toBeGreaterThan(
      layerValue("workspace-dialog"),
    );
    expect(layerValue("modal")).toBeGreaterThan(
      layerValue("workspace-fullscreen"),
    );
    expect(layerValue("command-palette")).toBeGreaterThan(layerValue("toast"));
    expect(layerValue("popover")).toBeGreaterThan(
      layerValue("command-palette"),
    );
    expect(layerValue("action-menu")).toBeGreaterThan(layerValue("popover"));
    expect(layerValue("select")).toBeGreaterThan(layerValue("action-menu"));
    expect(layerValue("tooltip")).toBeGreaterThan(layerValue("select"));
  });

  it("binds portaled primitives and known fullscreen owners to the scale", () => {
    ruleUsesLayer(".dl-popover-content", "popover");
    ruleUsesLayer(".dl-action-menu", "action-menu");
    ruleUsesLayer(".dl-select-content", "select");
    ruleUsesLayer(".dl-tooltip-content", "tooltip");
    ruleUsesLayer(
      '.chat-terminal-dock[data-expanded="true"]',
      "workspace-fullscreen",
    );
  });
});
