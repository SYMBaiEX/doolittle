// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  useMediaQuery,
  useVisibleInterval,
} from "../../packages/ui/src/environment";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function MediaView() {
  return <span>{String(useMediaQuery("(max-width: 760px)"))}</span>;
}

function PollView({ tick }: { tick: () => void }) {
  useVisibleInterval(tick, 100);
  return null;
}

it("updates viewport preferences and releases the media subscription", () => {
  const target = new EventTarget();
  let matches = false;
  const remove = vi.fn((type: string, callback: EventListener) =>
    target.removeEventListener(type, callback),
  );
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return matches;
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: remove,
  }));
  const element = document.createElement("div");
  const root = createRoot(element);
  act(() => root.render(<MediaView />));
  expect(element.textContent).toBe("false");
  act(() => {
    matches = true;
    target.dispatchEvent(new Event("change"));
  });
  expect(element.textContent).toBe("true");
  act(() => root.unmount());
  expect(remove).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});

it("pauses hidden polling, uses fresh callbacks, and stops on unmount", () => {
  vi.useFakeTimers();
  let visibility: DocumentVisibilityState = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
  const first = vi.fn();
  const second = vi.fn();
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<PollView tick={first} />));
  act(() => vi.advanceTimersByTime(100));
  expect(first).toHaveBeenCalledOnce();
  act(() => root.render(<PollView tick={second} />));
  act(() => vi.advanceTimersByTime(100));
  expect(second).toHaveBeenCalledOnce();
  act(() => {
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
  });
  act(() => vi.advanceTimersByTime(500));
  expect(second).toHaveBeenCalledOnce();
  act(() => {
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
  });
  act(() => vi.advanceTimersByTime(100));
  expect(second).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
  act(() => vi.advanceTimersByTime(500));
  expect(second).toHaveBeenCalledTimes(2);
});
