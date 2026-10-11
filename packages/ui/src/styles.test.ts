/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const rules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((match) => ({
  selectors: match[1]
    .trim()
    .split(",")
    .map((selector) => selector.trim()),
  declarations: match[2],
}));

describe("quiet shared interface style contract", () => {
  it("expresses current contacts and tabs with text, never persistent cards", () => {
    for (const selector of [
      ".dl-contact[aria-current]",
      '.dl-settings-tabs [role="tab"][aria-selected="true"]',
      '.dl-settings-content .dl-settings-choice[aria-pressed="true"]',
      '.dl-settings-content .dl-settings-theme-choice[aria-pressed="true"]',
    ]) {
      const matches = rules.filter((rule) => rule.selectors.includes(selector));
      expect(matches.length, selector).toBeGreaterThan(0);
      for (const { declarations } of matches) {
        expect(declarations, selector).not.toMatch(
          /background|border|box-shadow|text-decoration/gu,
        );
      }
    }
    expect(styles).not.toContain(".dl-settings-current");
    expect(styles).not.toContain("var(--surface-selected)");
  });

  it("keeps a visible keyboard focus distinct from route selection", () => {
    const focus = rules.find((rule) =>
      rule.selectors.includes(".dl-control:focus-visible"),
    );
    expect(focus?.declarations).toContain(
      "outline: 2px solid var(--focus-ring)",
    );
    expect(styles).toContain("outline-color: Highlight");
    expect(styles).toContain(".dl-select-item[data-highlighted]");
    expect(styles).toContain("min-height: var(--touch-height, 44px)");
  });

  it("defines materials at the composer and menu source, not late overrides", () => {
    for (const selector of [".dl-composer", ".dl-action-menu"]) {
      const ordinaryRules = rules.filter(
        (rule) => rule.selectors.length === 1 && rule.selectors[0] === selector,
      );
      // One geometry/material rule plus the menu's system-color fallback.
      expect(
        ordinaryRules.filter((rule) =>
          rule.declarations.includes("border-radius:"),
        ),
      ).toHaveLength(1);
    }
    expect(styles).not.toContain("transform: scale(0.97)");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(styles).toContain("prefers-reduced-transparency: reduce");
  });
});
