// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskSupervisionControls } from "./TaskSupervisionControls";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TaskSupervisionControls", () => {
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

  it("keeps advanced supervision compact without removing its controls", () => {
    const onConcurrencyChange = vi.fn();
    const onSupervise = vi.fn();

    act(() =>
      root.render(
        <TaskSupervisionControls
          active
          busy={false}
          concurrency="3"
          onConcurrencyChange={onConcurrencyChange}
          onSupervise={onSupervise}
        />,
      ),
    );

    const disclosure = container.querySelector("details");
    const summary = container.querySelector("summary");
    expect(disclosure?.open).toBe(false);
    expect(summary?.textContent).toContain("Parallel 3");

    act(() => summary?.click());
    expect(disclosure?.open).toBe(true);

    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="Supervision concurrency"]',
    );
    const run = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Run supervision",
    );
    expect(input?.disabled).toBe(false);

    act(() => run?.click());
    expect(onSupervise).toHaveBeenCalledOnce();
  });

  it("preserves inactive and busy safety states", () => {
    act(() =>
      root.render(
        <TaskSupervisionControls
          active={false}
          busy
          concurrency="2"
          onConcurrencyChange={vi.fn()}
          onSupervise={vi.fn()}
        />,
      ),
    );

    expect(container.textContent).toContain("Supervising…");
    expect(
      container.querySelector<HTMLInputElement>(
        '[aria-label="Supervision concurrency"]',
      )?.disabled,
    ).toBe(true);
    expect(container.querySelector("button")?.disabled).toBe(true);
  });
});
