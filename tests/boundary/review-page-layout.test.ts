import { describe, expect, it } from "vitest";
import { REVIEW_PAGE_CLASS } from "../../apps/desktop/src/renderer/review/layout";

describe("review page layout", () => {
  it("keeps notice banners at their natural height in the flex column", () => {
    // The review page is a flex column whose regions shrink when content
    // overflows. Banners must opt out so their text wraps and grows instead
    // of clipping mid-sentence at narrow widths.
    expect(REVIEW_PAGE_CLASS).toContain("[&>.notice]:shrink-0");
  });

  it("scrolls the page instead of hiding overflow at narrow widths", () => {
    expect(REVIEW_PAGE_CLASS).toContain("max-[760px]:overflow-auto");
  });
});
