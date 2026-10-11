// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLayoutMotion,
  useLiquidLayout,
  useSurfacePresence,
} from "./motion";

const box = (left: number, top: number) =>
  ({ left, top, width: 700, height: 120 }) as DOMRect;

describe("liquid surface movement", () => {
  it("moves only position, skips cross-conversation movement, and settles reduced motion", () => {
    let rect = box(0, 240);
    const running = { cancel: vi.fn(), onfinish: null };
    const element = {
      getBoundingClientRect: () => rect,
      animate: vi.fn(() => running),
    } as unknown as HTMLElement;
    const motion = createLayoutMotion(element);
    motion.update("conversation-a", false, 360);
    expect(element.animate).not.toHaveBeenCalled();
    rect = box(0, 600);
    motion.update("conversation-a", false, 360);
    expect(element.animate).toHaveBeenCalledWith(
      [
        { transform: "translate(0px, -360px)" },
        { transform: "translate(0, 0)" },
      ],
      { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    rect = box(0, 500);
    motion.update("conversation-b", false, 360);
    expect(running.cancel).toHaveBeenCalledOnce();
    expect(element.animate).toHaveBeenCalledTimes(1);
    rect = box(0, 240);
    motion.update("conversation-b", true, 360);
    expect(element.animate).toHaveBeenCalledTimes(1);
  });

  it("interrupts from the visible location without scaling text or waiting for completion", () => {
    let rect = box(0, 240);
    const animations = [
      { cancel: vi.fn(), onfinish: null },
      { cancel: vi.fn(), onfinish: null },
    ];
    const animate = vi
      .fn()
      .mockImplementationOnce(() => animations[0])
      .mockImplementationOnce(() => animations[1]);
    const element = {
      getBoundingClientRect: () => rect,
      animate,
    } as unknown as HTMLElement;
    const motion = createLayoutMotion(element);
    motion.update("same", false, 360);
    rect = box(0, 600);
    motion.update("same", false, 360);
    // The current animation is half-way through when a panel is reopened.
    rect = box(0, 420);
    animations[0].cancel.mockImplementation(() => {
      rect = box(24, 240);
    });
    motion.update("same", false, 360);
    expect(animate.mock.calls[1][0][0]).toEqual({
      transform: "translate(-24px, 180px)",
    });
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    motion.dispose();
    expect(animations[1].cancel).toHaveBeenCalledOnce();
  });

  it("does not animate hidden surfaces or a theme that disables motion", () => {
    let rect = { ...box(0, 0), width: 0 };
    const animate = vi.fn();
    const element = {
      getBoundingClientRect: () => rect,
      animate,
    } as unknown as HTMLElement;
    const motion = createLayoutMotion(element);
    motion.update("same", false, 360);
    rect = box(0, 600);
    motion.update("same", false, 360);
    rect = box(0, 240);
    motion.update("same", false, 0);
    expect(animate).not.toHaveBeenCalled();
  });
});

describe("controlled surface presence", () => {
  let root: Root;
  let container: HTMLDivElement;
  let reduced: boolean;
  let preference: EventTarget;
  beforeEach(() => {
    vi.useFakeTimers();
    reduced = false;
    preference = new EventTarget();
    window.matchMedia = vi.fn(() =>
      Object.assign(preference, { matches: reduced }),
    ) as unknown as typeof window.matchMedia;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.documentElement.style.removeProperty("--motion-duration");
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  function Surface({
    open,
    scope = "same",
  }: {
    open: boolean;
    scope?: string;
  }) {
    const presence = useSurfacePresence(open);
    const ref = useRef<HTMLDivElement>(null);
    useLiquidLayout(ref, String(open), scope);
    return presence.present ? (
      <div ref={ref} data-state={presence.state} inert={!open}>
        Panel
      </div>
    ) : null;
  }
  it("makes closing content inert immediately and cancels a stale exit on reopen", () => {
    act(() => root.render(<Surface open />));
    const panel = container.firstElementChild;
    act(() => root.render(<Surface open={false} />));
    expect(container.firstElementChild).toBe(panel);
    expect(panel?.getAttribute("data-state")).toBe("closed");
    expect(panel?.hasAttribute("inert")).toBe(true);
    act(() => vi.advanceTimersByTime(90));
    act(() => root.render(<Surface open />));
    act(() => vi.advanceTimersByTime(200));
    expect(container.firstElementChild).toBe(panel);
    expect(panel?.hasAttribute("inert")).toBe(false);
    act(() => root.render(<Surface open={false} />));
    act(() => vi.advanceTimersByTime(180));
    expect(container.firstElementChild).toBeNull();
  });
  it("dismisses immediately for reduced motion and settles an in-flight preference change", () => {
    reduced = true;
    act(() => root.render(<Surface open />));
    act(() => root.render(<Surface open={false} />));
    expect(container.firstElementChild).toBeNull();
    reduced = false;
    act(() => root.render(<Surface open />));
    act(() => root.render(<Surface open={false} />));
    act(() => preference.dispatchEvent(new Event("change")));
    expect(container.firstElementChild).toBeNull();
  });
  it("does not retain a closing pane when its theme disables motion", () => {
    document.documentElement.style.setProperty("--motion-duration", "0ms");
    act(() => root.render(<Surface open />));
    act(() => root.render(<Surface open={false} />));
    expect(container.firstElementChild).toBeNull();
  });
});
