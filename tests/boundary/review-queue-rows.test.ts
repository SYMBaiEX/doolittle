import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  join(
    __dirname,
    "../../apps/desktop/src/renderer/orchestration/work-surfaces.css",
  ),
  "utf8",
);

function ruleBody(selector: string): string {
  const start = stylesheet.indexOf(selector);
  if (start < 0) throw new Error(`Missing rule for ${selector}.`);
  const open = stylesheet.indexOf("{", start);
  const close = stylesheet.indexOf("}", open);
  return stylesheet.slice(open, close);
}

describe("review queue row sizing", () => {
  it("aligns rows to their content so the timestamp stays inside the row", () => {
    // Grid stretch circularity sized rows to their min-height while the
    // three-line copy overflowed 8px past the bottom edge; start alignment
    // lets each row contain title, summary, and timestamp with padding.
    expect(ruleBody(".review-rail .review-list")).toContain(
      "align-items: start",
    );
  });

  it("keeps the row grid layout for the list", () => {
    expect(ruleBody(".review-rail .review-list")).toContain("display: grid");
  });
});
