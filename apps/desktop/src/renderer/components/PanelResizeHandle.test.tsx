// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { compile } from "tailwindcss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WINDOW_RUNTIME_STATUS_TONE } from "../app-shell/shell-layout";
import { WORKBENCH_TAB_SIGNAL_CLASS } from "../thread-workbench/layout";
import { PanelResizeHandle } from "./PanelResizeHandle";

function dispatchPointerEvent(
  target: EventTarget,
  type: string,
  { clientX = 0, clientY = 0, pointerId = 1 } = {},
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
  });
  target.dispatchEvent(event);
}

describe("PanelResizeHandle", () => {
  afterEach(() => {
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
    expect(css).toContain("background-color: var(--accent)");
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
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
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
    expect(onResize).toHaveBeenLastCalledWith(276);
    expect(document.documentElement.style.cursor).toBe("col-resize");

    act(() => root.unmount());
    expect(document.documentElement.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
    expect(releasePointerCapture).toHaveBeenLastCalledWith(8);

    host.remove();
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
