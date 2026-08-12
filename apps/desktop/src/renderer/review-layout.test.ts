import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reviewCss = readFileSync(
  new URL("./review.css", import.meta.url),
  "utf8",
);

describe("review narrow viewport layout contract", () => {
  it("keeps the empty embedded review state full-width and intentional", () => {
    expect(reviewCss).toMatch(
      /\.review-work-overview\.is-empty\s*{[^}]*width:\s*100%;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
    );
    expect(reviewCss).not.toMatch(
      /\.review-work-overview\.is-empty\s*{[^}]*760px/s,
    );
  });

  it("stacks the rail above the detail surface through the final narrow cascade", () => {
    expect(reviewCss).toMatch(
      /@media \(width <= 860px\)\s*{[\s\S]*?\.review-workspace\s*{[^}]*min-height:\s*0;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*grid-template-rows:\s*minmax\(220px, 300px\) minmax\(0, 1fr\);[\s\S]*?\.review-rail\s*{[^}]*max-height:\s*300px;[^}]*border-right:\s*0;[^}]*border-bottom:\s*1px solid var\(--border\);/s,
    );
  });
});
