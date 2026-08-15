import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReviewQueueProps } from "./ReviewQueue";
import { ReviewQueue } from "./ReviewQueue";

function props(overrides: Partial<ReviewQueueProps> = {}): ReviewQueueProps {
  return {
    filter: "all",
    items: [
      {
        id: "approvals:one",
        kind: "approvals",
        title: "npm test",
        description: "Run the verification suite",
        status: "pending",
        raw: { id: "one" },
      },
    ],
    onFilterChange: vi.fn(),
    onQueryChange: vi.fn(),
    onSelect: vi.fn(),
    platform: "darwin",
    query: "",
    searchRef: { current: null },
    selectedId: "approvals:one",
    visibleItems: [
      {
        id: "approvals:one",
        kind: "approvals",
        title: "npm test",
        description: "Run the verification suite",
        status: "pending",
        raw: { id: "one" },
      },
    ],
    ...overrides,
  };
}

function render(overrides: Partial<ReviewQueueProps> = {}) {
  return renderToStaticMarkup(createElement(ReviewQueue, props(overrides)));
}

describe("ReviewQueue", () => {
  it("keeps the tablist, search affordance, and selected queue item contract", () => {
    const markup = render();

    expect(markup).toContain('data-review="queue"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="Search review queue"');
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain("npm test");
    expect(markup).toContain("⌘F");
  });

  it("preserves the empty result state while retaining filter context", () => {
    const markup = render({ visibleItems: [], query: "missing" });

    expect(markup).toContain('id="review-filter-panel"');
    expect(markup).toContain("No matching work");
    expect(markup).toContain(
      "Completed agent work will appear here as it happens.",
    );
    expect(markup).toContain('value="missing"');
  });
});
