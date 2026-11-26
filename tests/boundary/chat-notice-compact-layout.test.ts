import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const surfaceCss = readFileSync(
  resolve("apps/desktop/src/renderer/chat/chat-surface.css"),
  "utf8",
);

/** Extracts the full body of a @container block, balancing nested braces. */
function containerBlock(query: string): string {
  const start = surfaceCss.indexOf(query);
  expect(start, `expected ${query}`).toBeGreaterThanOrEqual(0);
  const open = surfaceCss.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < surfaceCss.length; index += 1) {
    const char = surfaceCss[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return surfaceCss.slice(open + 1, index);
  }
  throw new Error(`Unclosed container block: ${query}`);
}

it("flows compact notice copy and action inline in narrow sessions", () => {
  // In compact sessions the flex layout either squeezes the copy into a narrow
  // column beside the action or wraps the action onto its own row, costing a
  // short viewport most of its transcript height. The compact treatment must
  // keep the copy full-width with the action in the same inline stream.
  const compact = containerBlock("@container session (max-width: 450px)");
  expect(compact).toMatch(/\.chat-notice\s*\{[\s\S]*?display: block/u);
  expect(compact).toMatch(
    /\.chat-notice\s*>\s*span\s*\{[\s\S]*?display: inline/u,
  );
  expect(compact).toMatch(
    /\.chat-notice\s*>\s*svg\s*\{[\s\S]*?display: inline-block/u,
  );
});

it("keeps the wide-session notice layout and compact action spacing", () => {
  const base = surfaceCss.match(/^\.chat-notice\s*\{([\s\S]*?)\}/mu);
  expect(base?.[1]).toContain("display: flex");
  expect(base?.[1]).toContain("flex-wrap: wrap");

  // The compact action stays in the text stream, so it needs its own spacing
  // now that the flex row gap no longer applies.
  const compact = containerBlock("@container session (max-width: 450px)");
  expect(compact).toMatch(
    /\.chat-notice button\s*\{[\s\S]*?margin-inline-start/u,
  );
});
