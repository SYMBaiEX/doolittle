// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModalFocusBoundary } from "./useModalFocusBoundary";

function FocusBoundaryProbe({
  active,
  onClose,
}: {
  active: boolean;
  onClose: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocusBoundary({
    active,
    initialFocusSelector: "[data-initial]",
    onClose,
    restoreFocus: true,
    restoreFocusRef: triggerRef,
  });

  return (
    <>
      <button ref={triggerRef} type="button">
        Open
      </button>
      <div ref={dialogRef} tabIndex={-1}>
        <button data-initial type="button">
          First
        </button>
        <button type="button">Last</button>
      </div>
    </>
  );
}

describe("useModalFocusBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;
  let requestAnimationFrameSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
  });

  afterEach(() => {
    act(() => root.unmount());
    requestAnimationFrameSpy.mockRestore();
    container.remove();
  });

  it("focuses, traps, closes, and restores a modal boundary", () => {
    const onClose = vi.fn();
    act(() => root.render(<FocusBoundaryProbe active onClose={onClose} />));

    const [trigger, first, last] = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    );
    expect(document.activeElement).toBe(first);

    act(() => {
      first?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Tab",
          shiftKey: true,
        }),
      );
    });
    expect(document.activeElement).toBe(last);

    act(() => {
      last?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }),
      );
    });
    expect(document.activeElement).toBe(first);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledOnce();

    act(() =>
      root.render(<FocusBoundaryProbe active={false} onClose={onClose} />),
    );
    expect(document.activeElement).toBe(trigger);
  });
});
