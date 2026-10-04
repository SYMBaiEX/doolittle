// @vitest-environment jsdom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterReviewItems, type ReviewFilter } from "./models";
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

describe("ReviewQueue keyboard focus", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    // Keyboard focus is part of the interaction, not an animation-frame task.
    vi.stubGlobal("requestAnimationFrame", vi.fn());
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function mountQueue() {
    function ControlledQueue() {
      const [filter, setFilter] = useState<ReviewFilter>("all");
      const queueProps = props();
      return (
        <ReviewQueue
          {...queueProps}
          filter={filter}
          onFilterChange={setFilter}
          visibleItems={filterReviewItems(queueProps.items, filter, "")}
        />
      );
    }
    act(() => root.render(<ControlledQueue />));
    return [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  }

  function press(tab: HTMLButtonElement, key: string) {
    act(() => {
      tab.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
      );
    });
  }

  function expectSelectedAndFocused(tab: HTMLButtonElement) {
    expect(document.activeElement).toBe(tab);
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(tab.tabIndex).toBe(0);
    expect(
      container.querySelectorAll('[role="tab"][tabindex="0"]'),
    ).toHaveLength(1);
  }

  it("moves focus with End and Home when selecting an empty filter", () => {
    const tabs = mountQueue();
    const first = tabs[0];
    const last = tabs[tabs.length - 1];
    act(() => first.focus());

    press(first, "End");
    expectSelectedAndFocused(last);
    expect(container.textContent).toContain("No matching work");

    press(last, "Home");
    expectSelectedAndFocused(first);
    expect(container.textContent).toContain("npm test");
  });

  it("keeps successive arrow keys on the selected tab and wraps both ways", () => {
    const tabs = mountQueue();
    const first = tabs[0];
    const last = tabs[tabs.length - 1];
    act(() => first.focus());

    press(first, "ArrowRight");
    expectSelectedAndFocused(tabs[1]);
    press(tabs[1], "ArrowDown");
    expectSelectedAndFocused(tabs[2]);
    press(tabs[2], "ArrowUp");
    expectSelectedAndFocused(tabs[1]);
    press(tabs[1], "ArrowLeft");
    expectSelectedAndFocused(first);
    press(first, "ArrowLeft");
    expectSelectedAndFocused(last);
    press(last, "ArrowRight");
    expectSelectedAndFocused(first);
  });
});
