// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelResizeHandle } from "./PanelResizeHandle";

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
});
