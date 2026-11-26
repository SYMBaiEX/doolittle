import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const composerCss = readFileSync(
  resolve("apps/desktop/src/renderer/chat/composer-design.css"),
  "utf8",
);

function triggerMaxWidthPx(): number {
  const block = composerCss.match(/\.composer-route-trigger\s*\{([\s\S]*?)\}/u);
  expect(block, "expected a .composer-route-trigger rule").toBeTruthy();
  const maxWidth = block?.[1]?.match(/max-width:\s*min\((\d+)px,\s*100%\)/u);
  expect(
    maxWidth,
    "expected the route trigger cap as min(<px>, 100%)",
  ).toBeTruthy();
  return Number(maxWidth?.[1]);
}

it("lets the workspace chip size to its fixed status before truncating", () => {
  // The fixed "Workspace not confirmed" status needs ~200px once the glyph,
  // chevron, gaps, padding, and border are included. A cap below that truncates
  // the chip even when the composer footer has ample free space; flex shrinking
  // already handles genuinely crowded footers, so the cap only needs to guard
  // long project and model names.
  expect(triggerMaxWidthPx()).toBeGreaterThanOrEqual(224);
});

it("keeps the route trigger shrinkable for crowded footers", () => {
  const block = composerCss.match(/\.composer-route-trigger\s*\{([\s\S]*?)\}/u);
  expect(block?.[1]).toContain("min-width: 0");
  expect(block?.[1]).toContain("overflow: hidden");
  expect(composerCss).toMatch(
    /\.composer-route-label\s*\{[\s\S]*?text-overflow: ellipsis/u,
  );
});
