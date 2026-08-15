// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CatalogFilterBar } from "./CatalogFilterBar";

describe("CatalogFilterBar", () => {
  it("keeps search, route controls, and result feedback in one compact toolbar", () => {
    const markup = renderToStaticMarkup(
      <CatalogFilterBar
        onQueryChange={vi.fn()}
        placeholder="Search tools"
        query="files"
        resultLabel="8 of 24"
        searchLabel="Search runtime tools"
      >
        <select aria-label="Tool category" defaultValue="all">
          <option value="all">All</option>
        </select>
      </CatalogFilterBar>,
    );

    expect(markup).toContain('class="catalog-filter-bar flex');
    expect(markup).toContain("max-[760px]:flex-wrap");
    expect(markup).toContain('type="search"');
    expect(markup).toContain('aria-label="Tool category"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("8 of 24");
  });

  it("reports search edits immediately without owning route filter state", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onQueryChange = vi.fn();

    act(() => {
      root.render(
        <CatalogFilterBar
          onQueryChange={onQueryChange}
          placeholder="Search skills"
          query=""
          resultLabel="24 results"
          searchLabel="Search skills"
        />,
      );
    });
    const input = container.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      if (!input) return;
      setter?.call(input, "review");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onQueryChange).toHaveBeenCalledWith("review");
    act(() => root.unmount());
  });
});
