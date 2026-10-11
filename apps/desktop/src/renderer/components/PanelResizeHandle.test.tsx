// @vitest-environment jsdom

import { act, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { compile } from "tailwindcss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WINDOW_RUNTIME_STATUS_TONE } from "../app-shell/shell-layout";
import {
  dockedPanelResizeBounds,
  shellViewportWidth,
  subscribeShellViewportWidth,
  UTILITY_DRAWER_WIDTH,
} from "../panel-layout";
import { WORKBENCH_TAB_SIGNAL_CLASS } from "../thread-workbench/layout";
import { PanelResizeHandle } from "./PanelResizeHandle";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function dispatchPointerEvent(
  target: EventTarget,
  type: string,
  { clientX = 0, clientY = 0, pointerId = 1 } = {},
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
  });
  target.dispatchEvent(event);
}

function ResponsiveDockFixture() {
  const viewportWidth = useSyncExternalStore(
    subscribeShellViewportWidth,
    shellViewportWidth,
  );
  const [width, setWidth] = useState(360);
  return (
    <PanelResizeHandle
      bounds={dockedPanelResizeBounds(UTILITY_DRAWER_WIDTH, viewportWidth, 248)}
      className="left-0"
      controls="panel"
      direction="grow-right"
      label="Resize responsive dock"
      onResize={setWidth}
      value={width}
    />
  );
}

describe("PanelResizeHandle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.style.cursor = "";
    document.documentElement.style.userSelect = "";
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    delete document.documentElement.dataset.panelResizing;
  });

  it.each([
    { direction: "grow-right", key: "ArrowRight", next: 276 },
    { direction: "grow-left", key: "ArrowLeft", next: 276 },
    { direction: "grow-down", key: "ArrowDown", next: 276 },
    { direction: "grow-up", key: "ArrowUp", next: 276 },
  ] as const)(
    "puts solid keyboard focus on the interactive separator for $direction",
    async ({ direction, key, next }) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const onResize = vi.fn();
      try {
        act(() => {
          root.render(
            <PanelResizeHandle
              bounds={{ default: 260, min: 180, max: 520 }}
              className="left-0"
              controls="resize-test-panel"
              direction={direction}
              label="Resize panel"
              onResize={onResize}
              value={260}
            />,
          );
        });
        const handle = host.querySelector<HTMLHRElement>("hr");
        const signal = host.querySelector<HTMLSpanElement>("span");
        if (!handle || !signal) throw new Error("Resize controls not rendered");
        handle.focus();
        expect(document.activeElement).toBe(handle);
        expect(handle.tabIndex).toBe(0);
        expect(handle.getAttribute("aria-valuenow")).toBe("260");
        expect(handle.getAttribute("aria-controls")).toBe("resize-test-panel");
        expect(handle.getAttribute("aria-orientation")).toBe(
          direction === "grow-up" || direction === "grow-down"
            ? "horizontal"
            : "vertical",
        );
        act(() => {
          handle.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true }),
          );
        });
        expect(onResize).toHaveBeenCalledWith(next);
        expect(handle.className).toContain("focus-visible:outline-2");
        expect(handle.className).toContain(
          "focus-visible:outline-[var(--focus-ring)]",
        );
        expect(signal.className).toContain(
          "peer-focus-visible:bg-[var(--focus-ring)]",
        );
        expect(signal.className).toContain("pointer-events-none");
        expect(host.innerHTML).not.toMatch(/group-focus-visible|shadow-\[/u);

        const compiler = await compile("@tailwind utilities;");
        const css = compiler.build(
          [handle.className, signal.className].flatMap((value) =>
            value.split(/\s+/u),
          ),
        );
        expect(css).toContain(":focus-visible {");
        expect(css).toContain("outline-style: solid");
        expect(css).toContain("outline-width: 2px");
        expect(css).toContain("outline-color: var(--focus-ring)");
        expect(css).toContain("outline-offset: calc(2px * -1)");
        expect(css).toContain(":where(.peer):focus-visible ~ *");
        expect(css).toContain("background-color: var(--focus-ring)");
        expect(css).toContain("@media (prefers-reduced-motion: reduce)");
        expect(css).toContain("transition-property: none");
        expect(css).not.toContain("box-shadow");
      } finally {
        act(() => root.unmount());
        host.remove();
      }
    },
  );

  it("retains real shell and selected-tab signals without blurred bloom", async () => {
    const compiler = await compile("@tailwind utilities;");
    const css = compiler.build(
      [WINDOW_RUNTIME_STATUS_TONE.ready, WORKBENCH_TAB_SIGNAL_CLASS].flatMap(
        (value) => value.split(/\s+/u),
      ),
    );
    expect(css).toContain("background-color: var(--good)");
    expect(css).not.toContain("background-color: var(--accent)");
    expect(css).not.toContain("box-shadow");
  });

  it("owns pointer resize feedback without a stylesheet and restores document state", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onResize = vi.fn();

    act(() => {
      root.render(
        <PanelResizeHandle
          bounds={{ default: 260, min: 180, max: 520 }}
          className="left-0"
          controls="resize-test-panel"
          direction="grow-right"
          label="Resize project rail"
          onResize={onResize}
          value={260}
        />,
      );
    });

    const handle = host.querySelector<HTMLHRElement>(
      'hr[aria-label="Resize project rail"]',
    );
    expect(handle?.parentElement?.className).toContain("cursor-col-resize");

    act(() => {
      handle?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }),
      );
    });
    expect(document.documentElement.style.cursor).toBe("col-resize");
    expect(document.documentElement.style.userSelect).toBe("none");

    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { bubbles: true, clientX: 132 }),
      );
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, clientX: 132 }),
      );
    });
    expect(onResize).toHaveBeenCalledWith(292);
    expect(document.documentElement.style.cursor).toBe("");
    expect(document.documentElement.style.userSelect).toBe("");

    act(() => root.unmount());
    host.remove();
  });

  it("cleans up after lost pointer capture and permits a subsequent drag", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onResize = vi.fn();

    act(() => {
      root.render(
        <PanelResizeHandle
          bounds={{ default: 260, min: 180, max: 520 }}
          className="left-0"
          controls="resize-test-panel"
          direction="grow-right"
          label="Resize project rail"
          onResize={onResize}
          value={260}
        />,
      );
    });

    const handle = host.querySelector<HTMLHRElement>(
      'hr[aria-label="Resize project rail"]',
    );
    if (!handle) throw new Error("Resize handle was not rendered");
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(handle, {
      hasPointerCapture: () => true,
      releasePointerCapture,
      setPointerCapture,
    });

    act(() => {
      dispatchPointerEvent(handle, "pointerdown", {
        clientX: 100,
        pointerId: 7,
      });
      dispatchPointerEvent(window, "pointermove", {
        clientX: 132,
        pointerId: 7,
      });
    });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    act(() => vi.advanceTimersByTime(20));
    expect(onResize).toHaveBeenLastCalledWith(292);

    act(() => {
      dispatchPointerEvent(window, "pointermove", {
        clientX: 180,
        pointerId: 99,
      });
      dispatchPointerEvent(window, "pointerup", { pointerId: 99 });
    });
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(document.documentElement.style.cursor).toBe("col-resize");

    act(() => {
      dispatchPointerEvent(handle, "lostpointercapture", { pointerId: 7 });
      dispatchPointerEvent(window, "pointermove", {
        clientX: 160,
        pointerId: 7,
      });
    });
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(document.documentElement.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");

    act(() => {
      dispatchPointerEvent(handle, "pointerdown", {
        clientX: 160,
        pointerId: 8,
      });
      dispatchPointerEvent(window, "pointermove", {
        clientX: 176,
        pointerId: 8,
      });
    });
    expect(setPointerCapture).toHaveBeenLastCalledWith(8);
    act(() => vi.advanceTimersByTime(20));
    expect(onResize).toHaveBeenLastCalledWith(276);
    expect(document.documentElement.style.cursor).toBe("col-resize");

    act(() => root.unmount());
    expect(document.documentElement.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
    expect(releasePointerCapture).toHaveBeenLastCalledWith(8);

    host.remove();
  });

  it("coalesces moves, flushes the final position, and reports one gesture", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onResize = vi.fn();
    const onResizeActiveChange = vi.fn();
    act(() =>
      root.render(
        <PanelResizeHandle
          bounds={{ default: 260, min: 180, max: 520 }}
          className="left-0"
          controls="panel"
          direction="grow-right"
          label="Resize panel"
          onResize={onResize}
          onResizeActiveChange={onResizeActiveChange}
          value={260}
        />,
      ),
    );
    const handle = host.querySelector("hr");
    if (!handle) throw new Error("Resize handle not rendered");
    act(() => {
      dispatchPointerEvent(handle, "pointerdown", {
        clientX: 100,
        pointerId: 1,
      });
      dispatchPointerEvent(window, "pointermove", {
        clientX: 130,
        pointerId: 1,
      });
      dispatchPointerEvent(window, "pointermove", {
        clientX: 140,
        pointerId: 1,
      });
    });
    expect(onResize).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(20));
    expect(onResize).toHaveBeenCalledExactlyOnceWith(300);
    act(() => {
      dispatchPointerEvent(window, "pointermove", {
        clientX: 150,
        pointerId: 1,
      });
      dispatchPointerEvent(window, "pointerup", { clientX: 160, pointerId: 1 });
    });
    expect(onResize).toHaveBeenLastCalledWith(320);
    expect(onResizeActiveChange.mock.calls).toEqual([[true], [false]]);
    act(() => vi.advanceTimersByTime(20));
    expect(onResize).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
    host.remove();
  });

  it("ignores secondary buttons and ends an uncaptured drag on window blur", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onResize = vi.fn();
    const onResizeActiveChange = vi.fn();
    act(() =>
      root.render(
        <PanelResizeHandle
          bounds={{ default: 260, min: 180, max: 520 }}
          className="left-0"
          controls="panel"
          direction="grow-right"
          label="Resize panel"
          onResize={onResize}
          onResizeActiveChange={onResizeActiveChange}
          value={260}
        />,
      ),
    );
    const handle = host.querySelector("hr");
    if (!handle) throw new Error("Resize handle not rendered");
    act(() =>
      handle.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 2 }),
      ),
    );
    expect(document.documentElement.style.cursor).toBe("");
    expect(onResizeActiveChange).not.toHaveBeenCalled();
    act(() => {
      dispatchPointerEvent(handle, "pointerdown", { clientX: 100 });
      dispatchPointerEvent(window, "pointermove", { clientX: 130 });
      window.dispatchEvent(new Event("blur"));
    });
    expect(onResize).toHaveBeenCalledExactlyOnceWith(290);
    expect(onResizeActiveChange.mock.calls).toEqual([[true], [false]]);
    expect(document.documentElement.style.cursor).toBe("");
    act(() => dispatchPointerEvent(window, "pointermove", { clientX: 160 }));
    expect(onResize).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    host.remove();
  });

  it("delivers a pending drag frame to the current controlled owner", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const first = vi.fn();
    const current = vi.fn();
    const render = (onResize: (value: number) => void) => (
      <PanelResizeHandle
        bounds={{ default: 260, min: 180, max: 520 }}
        className="left-0"
        controls="panel"
        direction="grow-right"
        label="Resize panel"
        onResize={onResize}
        value={260}
      />
    );
    try {
      act(() => root.render(render(first)));
      const handle = host.querySelector("hr");
      if (!handle) throw new Error("Resize handle not rendered");
      act(() => {
        dispatchPointerEvent(handle, "pointerdown", { clientX: 100 });
        dispatchPointerEvent(window, "pointermove", { clientX: 140 });
      });
      act(() => root.render(render(current)));
      act(() => vi.advanceTimersByTime(20));
      expect(first).not.toHaveBeenCalled();
      expect(current).toHaveBeenCalledExactlyOnceWith(300);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  it("refreshes same-band viewport bounds before a new drag", () => {
    const originalWidth = window.innerWidth;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 2000,
        writable: true,
      });
      act(() => root.render(<ResponsiveDockFixture />));
      const handle = host.querySelector("hr");
      if (!handle) throw new Error("Resize handle not rendered");
      expect(handle.getAttribute("aria-valuemax")).toBe("520");
      act(() => {
        window.innerWidth = 1600;
        window.dispatchEvent(new Event("resize"));
      });
      expect(handle.getAttribute("aria-valuemax")).toBe("392");
      act(() => {
        dispatchPointerEvent(handle, "pointerdown", { clientX: 100 });
        dispatchPointerEvent(window, "pointerup", { clientX: 500 });
      });
      expect(handle.getAttribute("aria-valuenow")).toBe("392");
    } finally {
      act(() => root.unmount());
      host.remove();
      window.innerWidth = originalWidth;
    }
  });

  it("constrains the current size, queued frame, and pointer-up when the window shrinks mid-drag", () => {
    const originalWidth = window.innerWidth;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 2000,
        writable: true,
      });
      act(() => root.render(<ResponsiveDockFixture />));
      const handle = host.querySelector("hr");
      if (!handle) throw new Error("Resize handle not rendered");
      act(() => {
        dispatchPointerEvent(handle, "pointerdown", { clientX: 100 });
        dispatchPointerEvent(window, "pointermove", { clientX: 240 });
        vi.advanceTimersByTime(20);
      });
      expect(handle.getAttribute("aria-valuenow")).toBe("500");
      act(() => dispatchPointerEvent(window, "pointermove", { clientX: 250 }));
      act(() => {
        window.innerWidth = 1600;
        window.dispatchEvent(new Event("resize"));
      });
      expect(handle.getAttribute("aria-valuemax")).toBe("392");
      expect(handle.getAttribute("aria-valuenow")).toBe("392");
      act(() => vi.advanceTimersByTime(20));
      expect(handle.getAttribute("aria-valuenow")).toBe("392");
      act(() => dispatchPointerEvent(window, "pointerup", { clientX: 400 }));
      expect(handle.getAttribute("aria-valuenow")).toBe("392");
      expect(document.documentElement.dataset.panelResizing).toBeUndefined();
    } finally {
      act(() => root.unmount());
      host.remove();
      window.innerWidth = originalWidth;
    }
  });

  it.each([
    { key: "Home", expected: 180 },
    { key: "End", expected: 520 },
  ])(
    "supports $key to resize to the corresponding bound",
    ({ key, expected }) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const onResize = vi.fn();
      try {
        act(() => {
          root.render(
            <PanelResizeHandle
              bounds={{ default: 260, min: 180, max: 520 }}
              className="left-0"
              controls="resize-test-panel"
              direction="grow-right"
              label="Resize panel"
              onResize={onResize}
              value={260}
            />,
          );
        });
        const handle = host.querySelector("hr");
        if (!handle) throw new Error("Resize control not rendered");
        act(() =>
          handle.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, key }),
          ),
        );
        expect(onResize).toHaveBeenCalledWith(expected);
      } finally {
        act(() => root.unmount());
        host.remove();
      }
    },
  );
});
