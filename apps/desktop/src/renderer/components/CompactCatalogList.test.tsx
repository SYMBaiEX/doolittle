import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  type CompactCatalogEntry,
  CompactCatalogList,
} from "./CompactCatalogList";

function entry(index: number): CompactCatalogEntry {
  return {
    id: `entry-${index}`,
    eyebrow: "Runtime",
    title: `Entry ${index}`,
    description: `Description ${index}`,
    status: "Enabled",
    tone: "good",
    code: `ENTRY_${index}`,
    facts: [{ label: "Source", value: "Eliza" }],
  };
}

describe("CompactCatalogList", () => {
  it("bounds the initial catalog while keeping expansion explicit", () => {
    const markup = renderToStaticMarkup(
      <CompactCatalogList
        ariaLabel="Runtime catalog"
        entries={Array.from({ length: 30 }, (_, index) => entry(index))}
        pageSize={24}
        resetKey="all"
      />,
    );

    expect(markup.match(/<li class="compact-catalog__row"/g)).toHaveLength(24);
    expect(markup).toContain("Showing 24 of 30");
    expect(markup).toContain("Show 6 more");
    expect(markup).toContain("<summary>Details</summary>");
  });
});
