// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Toast } from "./ToastRegion";
import { ToastViewport } from "./ToastViewport";

describe("ToastRegion", () => {
  let container: HTMLDivElement;
  let root: Root;
  const toast: Toast = {
    id: "toast-1",
    message: "Saved",
    tone: "success",
    title: "Workspace updated",
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps a toast paused while focus moves to its dismiss control", () => {
    const onPause = vi.fn();
    const onResume = vi.fn();

    act(() =>
      root.render(
        <ToastViewport
          onDismiss={vi.fn()}
          onPause={onPause}
          onResume={onResume}
          toasts={[toast]}
        />,
      ),
    );

    const item = container.querySelector<HTMLLIElement>("li");
    const close = container.querySelector<HTMLButtonElement>(".toast-close");
    const outside = document.createElement("button");
    document.body.append(outside);
    expect(item).not.toBeNull();
    expect(close).not.toBeNull();

    act(() => item?.focus());
    expect(onPause).toHaveBeenCalledWith("toast-1");

    onResume.mockClear();
    act(() => close?.focus());
    expect(onResume).not.toHaveBeenCalled();

    act(() => outside.focus());
    expect(onResume).toHaveBeenCalledWith("toast-1");
    outside.remove();
  });
});
