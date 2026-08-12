// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPaletteLoadingFallback } from "./App";

describe("CommandPaletteLoadingFallback", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("announces a modal loading state and restores its trigger on Escape", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();

    act(() => {
      root.render(
        <CommandPaletteLoadingFallback
          onClose={onClose}
          open
          returnFocusTarget={trigger}
        />,
      );
    });

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const status = container.querySelector<HTMLElement>('[role="status"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-describedby")).toBe(status?.id);
    expect(status?.getAttribute("aria-busy")).toBe("true");
    expect(status?.textContent).toContain("Loading commands");
    expect(document.activeElement).toBe(dialog);

    act(() => {
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });

    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("dismisses from the loading backdrop", () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <CommandPaletteLoadingFallback
          onClose={onClose}
          open
          returnFocusTarget={null}
        />,
      );
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>(".command-palette-loading-dismiss")
        ?.click();
    });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
