import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reviewCss = readFileSync(
  new URL("./review.css", import.meta.url),
  "utf8",
);

describe("review narrow viewport layout contract", () => {
  it("keeps the empty embedded review state focused and fluid", () => {
    expect(reviewCss).toMatch(
      /\.review-work-overview\.is-empty\s*{[^}]*width:\s*min\(100%, 920px\);[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
    );
    expect(reviewCss).toMatch(
      /\.review-work-overview\.is-empty\s*{[^}]*align-self:\s*center;[^}]*margin-top:\s*clamp\(12px, 6vh, 72px\);/s,
    );
  });

  it("stacks the rail above the detail surface through the final narrow cascade", () => {
    expect(reviewCss).toMatch(
      /@media \(width <= 860px\)\s*{[\s\S]*?\.review-workspace\s*{[^}]*min-height:\s*0;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*grid-template-rows:\s*minmax\(220px, 300px\) minmax\(0, 1fr\);[\s\S]*?\.review-rail\s*{[^}]*max-height:\s*300px;[^}]*border-right:\s*0;[^}]*border-bottom:\s*1px solid var\(--border\);/s,
    );
  });
});
