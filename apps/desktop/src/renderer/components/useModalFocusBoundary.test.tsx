// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModalFocusBoundary } from "./useModalFocusBoundary";

function FocusBoundaryProbe({
  active,
  mounted = true,
  onClose,
}: {
  active: boolean;
  mounted?: boolean;
  onClose: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocusBoundary({
    active,
    initialFocusSelector: "[data-initial]",
    isolateBackground: true,
    onClose,
    restoreFocus: true,
    restoreFocusRef: triggerRef,
  });

  return (
    <>
      <button ref={triggerRef} type="button">
        Open
      </button>
      {mounted ? (
        <div ref={dialogRef} tabIndex={-1}>
          <button data-initial type="button">
            First
          </button>
          <button type="button">Last</button>
        </div>
      ) : null}
    </>
  );
}

function UnmountingModal({ trigger }: { trigger: HTMLButtonElement | null }) {
  const dialogRef = useModalFocusBoundary({
    active: true,
    onClose: () => {},
    restoreFocus: true,
    restoreFocusTarget: trigger,
  });
  return (
    <div ref={dialogRef} tabIndex={-1}>
      <button type="button">Inside modal</button>
    </div>
  );
}

function ConditionalModalHost({ mounted }: { mounted: boolean }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button">
        Open
      </button>
      {mounted ? <UnmountingModal trigger={triggerRef.current} /> : null}
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
    expect(trigger.inert).toBe(true);
    expect(trigger.getAttribute("aria-hidden")).toBe("true");

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
    expect(trigger.inert).not.toBe(true);
    expect(trigger.hasAttribute("aria-hidden")).toBe(false);
  });

  it("restores focus when an active modal is conditionally unmounted", () => {
    act(() => root.render(<ConditionalModalHost mounted={false} />));
    const trigger = container.querySelector("button");
    trigger?.focus();
    act(() => root.render(<ConditionalModalHost mounted />));
    expect(document.activeElement).not.toBe(trigger);

    act(() => root.render(<ConditionalModalHost mounted={false} />));
    expect(document.activeElement).toBe(trigger);
  });
});
