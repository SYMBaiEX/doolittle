// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PanelTabs } from "../../apps/desktop/src/renderer/components/PanelTabs";

function OverflowFixture({ onSelect }: { onSelect: (id: string) => void }) {
  const [selected, setSelected] = useState("tasks");
  return (
    <PanelTabs
      id="overflow-work"
      items={[
        { id: "tasks", label: "Queue" },
        { id: "agents", label: "Agents" },
        { id: "plans", label: "Plans" },
        { id: "inbox", label: "Inbox" },
      ]}
      label="Work views"
      onSelect={(id) => {
        onSelect(id);
        setSelected(id);
      }}
      overflowControls
      selected={selected}
    />
  );
}

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

it("exposes overflow controls only when needed and preserves manual tab selection", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const reveal = vi.fn();
  const originalReveal = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = reveal;
  const onSelect = vi.fn();

  try {
    act(() => root.render(<OverflowFixture onSelect={onSelect} />));
    const list = host.querySelector<HTMLElement>('[role="tablist"]');
    if (!list?.parentElement) throw new Error("Missing tab rail");
    let width = 300;
    Object.defineProperty(list.parentElement, "clientWidth", {
      get: () => width,
    });
    Object.defineProperties(list, {
      clientWidth: { get: () => width - 64 },
      scrollWidth: { get: () => 500 },
    });
    list.scrollBy = vi.fn((options?: ScrollToOptions | number) => {
      const left = typeof options === "number" ? options : (options?.left ?? 0);
      list.scrollLeft = Math.max(
        0,
        Math.min(500 - list.clientWidth, list.scrollLeft + left),
      );
      list.dispatchEvent(new Event("scroll"));
    });
    const arrow = (direction: string) =>
      host.querySelector<HTMLButtonElement>(
        `[aria-label="Scroll work views ${direction}"]`,
      );
    expect(arrow("right")).toBeNull();
    act(() => resize());
    expect(arrow("left")?.disabled).toBe(true);
    expect(arrow("right")?.disabled).toBe(false);
    expect(list.contains(arrow("right"))).toBe(false);

    act(() => arrow("right")?.click());
    act(() => arrow("right")?.click());
    expect(list.scrollLeft).toBe(264);
    expect(arrow("right")?.disabled).toBe(true);
    expect(arrow("left")?.disabled).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
    act(() => arrow("left")?.click());
    expect(list.scrollLeft).toBeLessThan(264);

    const queue = host.querySelector<HTMLButtonElement>(
      "#overflow-work-tasks-tab",
    );
    const inbox = host.querySelector<HTMLButtonElement>(
      "#overflow-work-inbox-tab",
    );
    // A second click on an already focused tab leaves Radix's pointer-entry
    // flag set. Keyboard re-entry must still land on a tab, not the scrollport.
    act(() => {
      queue?.focus();
      queue?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      queue?.blur();
      list.focus();
    });
    expect(document.activeElement).toBe(queue);
    await act(async () => {
      queue?.focus();
      queue?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "End" }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(inbox);
    expect(queue?.getAttribute("aria-selected")).toBe("true");
    expect(onSelect).not.toHaveBeenCalled();
    reveal.mockClear();
    act(() => inbox?.click());
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("inbox");
    expect(reveal.mock.instances).toContain(inbox);
    expect(inbox?.getAttribute("aria-selected")).toBe("true");

    // Enough space for all labels removes the arrows, including their width.
    width = 520;
    act(() => resize());
    expect(arrow("left")).toBeNull();
    expect(arrow("right")).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    HTMLElement.prototype.scrollIntoView = originalReveal;
    vi.unstubAllGlobals();
  }
  expect(disconnect).toHaveBeenCalledOnce();
});
