import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import {
  REVIEW_DETAIL_CLASS,
  REVIEW_PAGE_CLASS,
  REVIEW_RAIL_CLASS,
  REVIEW_TAB_CLASS,
  REVIEW_TABS_CLASS,
  REVIEW_WORKSPACE_CLASS,
  reviewOverviewClass,
} from "./review/layout";

describe("review narrow viewport layout contract", () => {
  it("compiles normal-flow narrow content instead of clipping the rail under a docked terminal", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const candidates = [
      REVIEW_WORKSPACE_CLASS,
      REVIEW_RAIL_CLASS,
      REVIEW_DETAIL_CLASS,
    ].flatMap((className) =>
      className
        .split(/\s+/u)
        .filter((candidate) => candidate.startsWith("max-[760px]:")),
    );
    const css = compiler.build(candidates);

    expect(candidates).toHaveLength(5);
    expect(css).toContain("@media (width < 760px)");
    expect(css).toContain("flex: none");
    expect(css).toContain("grid-template-rows: auto auto");
    expect(css).toContain("overflow: visible");
    expect(css).toContain("min-height: calc(var(--spacing) * 75)");
    expect(css).not.toContain("overflow: hidden");
    expect(REVIEW_PAGE_CLASS).toContain("max-[760px]:overflow-auto");
    expect(REVIEW_WORKSPACE_CLASS).toContain("flex-1");
    expect(REVIEW_WORKSPACE_CLASS).toContain("overflow-hidden");
    expect(REVIEW_DETAIL_CLASS).toContain("overflow-auto");
    expect(REVIEW_DETAIL_CLASS).toContain("max-[760px]:overflow-visible");
  });

  it("compiles visible two-column filters with wrapping labels and narrow touch targets", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const css = compiler.build(
      [REVIEW_TABS_CLASS, REVIEW_TAB_CLASS].flatMap((className) =>
        className.split(/\s+/u),
      ),
    );

    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(REVIEW_TABS_CLASS).toContain("shrink-0");
    expect(css).toMatch(/\.shrink-0 \{\s+flex-shrink: 0;/u);
    expect(REVIEW_TABS_CLASS).not.toContain("grid-cols-4");
    expect(REVIEW_TABS_CLASS).not.toContain("82px");
    expect(REVIEW_TABS_CLASS).not.toContain("overflow-x-auto");
    expect(css).toContain("white-space: normal");
    expect(css).not.toContain("white-space: nowrap");
    expect(css).toContain("min-width: 0px");
    expect(css).toContain("> span {");
    expect(css).toContain("flex-shrink: 0");
    expect(css).toContain("@media (width < 760px)");
    expect(css).toContain("min-height: calc(var(--spacing) * 11)");
    expect(REVIEW_TAB_CLASS).not.toContain("truncate");
    expect(REVIEW_TAB_CLASS).not.toContain("hidden");
  });

  it("keeps the empty embedded review state focused and fluid", () => {
    const overview = reviewOverviewClass("neutral", true);

    expect(overview).toContain("w-[min(100%,920px)]");
    expect(overview).toContain("grid-cols-[minmax(0,1fr)]");
    expect(overview).toContain("self-center");
    expect(overview).toContain("mt-[clamp(12px,6vh,72px)]");
  });

  it("stacks the rail above the detail surface through the final narrow cascade", () => {
    expect(REVIEW_WORKSPACE_CLASS).toContain("min-h-0");
    expect(REVIEW_WORKSPACE_CLASS).toContain(
      "max-[860px]:grid-cols-[minmax(0,1fr)]",
    );
    expect(REVIEW_WORKSPACE_CLASS).toContain(
      "max-[860px]:grid-rows-[minmax(220px,300px)_minmax(0,1fr)]",
    );
    expect(REVIEW_RAIL_CLASS).toContain("max-[860px]:max-h-75");
    expect(REVIEW_RAIL_CLASS).toContain("max-[860px]:border-r-0");
    expect(REVIEW_RAIL_CLASS).toContain("max-[860px]:border-b");
  });
});
