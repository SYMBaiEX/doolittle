// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DesktopUtilityLayer } from "./DesktopUtilityLayer";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const props = {
  activity: null,
  mobileModal: true,
  onClose: () => undefined,
  onKeyDown: () => undefined,
  onResize: () => undefined,
  utilityDrawerWidth: 360,
  utilityRef: { current: null },
};

describe("DesktopUtilityLayer", () => {
  it("focuses a lazily mounted modal and retains focus when switching to docked", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const utilityRef = { current: null };
    const onClose = vi.fn();
    try {
      act(() =>
        root.render(
          createElement(DesktopUtilityLayer, { ...props, utilityRef, onClose }),
        ),
      );
      const close = host.querySelector<HTMLButtonElement>(
        'aside button[aria-label="Close Activity"]',
      );
      if (!close) throw new Error("Close action not rendered");
      expect(document.activeElement).toBe(close);
      act(() =>
        root.render(
          createElement(DesktopUtilityLayer, {
            ...props,
            utilityRef,
            onClose,
            mobileModal: false,
          }),
        ),
      );
      expect(document.activeElement).toBe(close);
      act(() => close.click());
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  it("keeps reset and keyboard adjustment inside docked resize bounds", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onResize = vi.fn();
    try {
      act(() =>
        root.render(
          createElement(DesktopUtilityLayer, {
            ...props,
            mobileModal: false,
            utilityDrawerWidth: 310,
            resizeBounds: { default: 360, min: 292, max: 320 },
            onResize,
          }),
        ),
      );
      const handle = host.querySelector<HTMLHRElement>(
        'hr[aria-label="Resize Activity panel"]',
      );
      if (!handle) throw new Error("Resize handle not rendered");
      expect(handle.parentElement?.className).toContain("left-0");
      act(() =>
        handle.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
        ),
      );
      expect(onResize).toHaveBeenLastCalledWith(320);
      act(() =>
        handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
      );
      expect(onResize).toHaveBeenLastCalledWith(320);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
  it("renders the narrow utility drawer as an isolated modal sheet", () => {
    const markup = renderToStaticMarkup(
      createElement(DesktopUtilityLayer, props),
    );

    expect(markup).toContain('data-utility-backdrop=""');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-label="Activity"');
    expect(markup).toContain("Activity");
    expect(markup).toContain('aria-label="Close Activity"');
    expect(markup).toContain('type="button"');
    expect(markup).not.toContain(">View all<");
    expect(markup).not.toContain("Search tools");
    expect(markup).not.toContain("All Doolittle tools and settings");
  });

  it("keeps the wide utility pane non-modal", () => {
    const markup = renderToStaticMarkup(
      createElement(DesktopUtilityLayer, { ...props, mobileModal: false }),
    );

    expect(markup).not.toContain('data-utility-backdrop=""');
    expect(markup).not.toContain('aria-modal="true"');
    expect(markup).not.toContain('role="dialog"');
    expect(markup).toContain('role="complementary"');
    expect(markup).toContain('aria-label="Activity"');
  });
});
