import { describe, expect, it } from "vitest";
import {
  REVIEW_RAIL_CLASS,
  REVIEW_WORKSPACE_CLASS,
  reviewOverviewClass,
} from "./review/layout";

describe("review narrow viewport layout contract", () => {
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
