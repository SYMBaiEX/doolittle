// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginCatalogWorkspace } from "./PluginCatalogWorkspace";
import type { PluginCatalogItem } from "./plugin-catalog-model";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function plugin(
  index: number,
  overrides: Partial<PluginCatalogItem> = {},
): PluginCatalogItem {
  return {
    id: `providers-plugin-${index}`,
    title: `Plugin ${index}`,
    description: `Runtime purpose ${index}`,
    packageName: `@example/plugin-${index}`,
    category: "providers",
    source: "official",
    kind: "provider",
    maturity: "production",
    persistence: "none",
    enabled: true,
    ...overrides,
  };
}

describe("PluginCatalogWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("keeps plugin purpose and provenance in one focused detail pane", () => {
    act(() =>
      root.render(
        <PluginCatalogWorkspace
          entries={Array.from({ length: 20 }, (_, index) => plugin(index))}
          resetKey="all:"
        />,
      ),
    );

    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(12);
    expect(container.textContent).toContain("12 of 20");
    expect(container.textContent).toContain("Runtime purpose 0");
    expect(container.textContent).not.toContain("Runtime purpose 10");
    expect(container.querySelectorAll(".badge")).toHaveLength(1);
    expect(
      container
        .querySelector('[role="tabpanel"]')
        ?.getAttribute("aria-labelledby"),
    ).toContain("-plugin-0");
  });

  it("shows inactive configuration truth only for the selected exception", () => {
    act(() =>
      root.render(
        <PluginCatalogWorkspace
          entries={[plugin(0), plugin(1, { enabled: false })]}
          resetKey="all:"
        />,
      ),
    );

    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    act(() => tabs[1]?.click());
    expect(container.querySelector('[role="note"]')?.textContent).toContain(
      "not loaded by the current local configuration",
    );
    expect(
      container.querySelector('[role="tabpanel"] .badge')?.textContent,
    ).toBe("Inactive");
  });

  it("moves the focused selection with vertical list keys", () => {
    act(() =>
      root.render(
        <PluginCatalogWorkspace
          entries={[plugin(0), plugin(1), plugin(2)]}
          resetKey="all:"
        />,
      ),
    );

    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    act(() =>
      tabs[0]?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "End" }),
      ),
    );
    expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[2]);
    expect(container.textContent).toContain("Runtime purpose 2");
  });

  it("progressively reveals the remaining plugins", () => {
    act(() =>
      root.render(
        <PluginCatalogWorkspace
          entries={Array.from({ length: 20 }, (_, index) => plugin(index))}
          resetKey="all:"
        />,
      ),
    );

    const showMore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Show 8 more",
    );
    act(() => showMore?.click());
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(20);
    expect(container.textContent).not.toContain("12 of 20");
  });
});
