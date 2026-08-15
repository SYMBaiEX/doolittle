// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompatibilityEmptyState } from "./CompatibilityPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("CompatibilityEmptyState", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the empty truth compact and reruns checks on request", () => {
    const onRetry = vi.fn();
    act(() => root.render(<CompatibilityEmptyState onRetry={onRetry} />));

    const state = container.querySelector('[data-compatibility-empty="true"]');
    expect(state?.getAttribute("aria-labelledby")).toBe(
      "compatibility-empty-title",
    );
    expect(container.textContent).toContain("No compatibility checks reported");

    act(() => container.querySelector("button")?.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
