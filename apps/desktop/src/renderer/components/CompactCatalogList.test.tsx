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

  it("keeps a row action adjacent to its status", () => {
    const markup = renderToStaticMarkup(
      <CompactCatalogList
        ariaLabel="Profiles"
        entries={[
          {
            ...entry(1),
            action: <button type="button">Use profile</button>,
          },
        ]}
        resetKey="profiles"
      />,
    );

    expect(markup).toContain('class="compact-catalog__actions"');
    expect(markup).toContain("Use profile");
  });

  it("supports page-specific disclosure copy without a custom row system", () => {
    const markup = renderToStaticMarkup(
      <CompactCatalogList
        ariaLabel="Registry"
        entries={[
          {
            ...entry(1),
            detailsLabel: "Policy & provenance",
            detailsNote: "Approval requires an explicit allowlist entry.",
          },
        ]}
        resetKey="registry"
      />,
    );

    expect(markup).toContain("<summary>Policy &amp; provenance</summary>");
    expect(markup).toContain("Approval requires an explicit allowlist entry.");
  });
});
