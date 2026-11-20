// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PanelTabs } from "../../apps/desktop/src/renderer/components/PanelTabs";

it("moves workspace tab focus without replacing the selected panel", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onSelect = vi.fn();

  try {
    act(() =>
      root.render(
        <PanelTabs
          id="work"
          items={[
            { id: "tasks", label: "Queue" },
            { id: "runs", label: "Runs", panelId: "runs-panel" },
          ]}
          label="Work views"
          onSelect={onSelect}
          selected="tasks"
        />,
      ),
    );
    const queue = container.querySelector<HTMLButtonElement>("#work-tasks-tab");
    const runs = container.querySelector<HTMLButtonElement>("#work-runs-tab");
    expect(queue?.getAttribute("aria-controls")).toBe("work-panel");
    expect(runs?.getAttribute("aria-controls")).toBe("runs-panel");

    await act(async () => {
      queue?.focus();
      queue?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.activeElement).toBe(runs);
    expect(queue?.getAttribute("aria-selected")).toBe("true");
    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      expect(
        runs?.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Enter",
          }),
        ),
      ).toBe(true);
    });
    expect(onSelect).not.toHaveBeenCalled();

    // jsdom does not synthesize the native button click after Enter.
    act(() => runs?.click());
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("runs");
    onSelect.mockClear();

    act(() => {
      runs?.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });
    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      runs?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0, detail: 1 }),
      );
    });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("runs");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
