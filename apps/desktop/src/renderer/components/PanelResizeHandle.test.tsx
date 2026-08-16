// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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
});
