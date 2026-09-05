// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDialogFocus } from "./dialog-focus";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function DialogProbe({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(open, dialogRef, closeRef, onClose, false, boundaryRef);

  return (
    <>
      <button type="button">Open projects</button>
      {open ? (
        <div ref={boundaryRef}>
          <div ref={dialogRef} role="dialog" tabIndex={-1}>
            <button ref={closeRef} type="button">
              Close projects
            </button>
            <button type="button">Last action</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

describe("useDialogFocus", () => {
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

  it("isolates the project dialog background and restores its trigger", () => {
    const onClose = vi.fn();
    act(() => root.render(<DialogProbe open={false} onClose={onClose} />));
    const trigger = container.querySelector<HTMLButtonElement>("button");
    act(() => trigger?.focus());
    act(() => root.render(<DialogProbe open onClose={onClose} />));

    const [, close, last] = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    );
    expect(document.activeElement).toBe(close);
    expect(trigger.inert).toBe(true);
    expect(trigger.getAttribute("aria-hidden")).toBe("true");

    act(() => {
      last?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }),
      );
    });
    expect(document.activeElement).toBe(close);

    act(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(onClose).toHaveBeenCalledOnce();

    act(() => root.render(<DialogProbe open={false} onClose={onClose} />));
    expect(document.activeElement).toBe(trigger);
    expect(trigger.inert).not.toBe(true);
    expect(trigger.hasAttribute("aria-hidden")).toBe(false);
  });
});
