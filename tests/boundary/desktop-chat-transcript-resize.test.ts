// @vitest-environment jsdom

import { expect, it, vi } from "vitest";
import { observeChatTranscriptResize } from "../../apps/desktop/src/renderer/chat/chat-scroll";

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  readonly callback: ResizeObserverCallback;
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function harness() {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  ResizeObserverMock.instances = [];
  const frames: FrameRequestCallback[] = [];
  const scrollToEnd = vi.fn();
  let follow = true;
  const element = document.createElement("div");
  const stop = observeChatTranscriptResize(
    element,
    () => follow,
    scrollToEnd,
    (callback) => {
      frames.push(callback);
      return frames.length;
    },
  );
  const observer = ResizeObserverMock.instances[0];
  if (!observer) throw new Error("Resize observer was not created");
  return {
    observer,
    scrollToEnd,
    stop,
    setFollow(value: boolean) {
      follow = value;
    },
    flushFrame() {
      const callback = frames.shift();
      if (!callback) throw new Error("No animation frame was scheduled");
      callback(0);
    },
    frameCount: () => frames.length,
    dispose() {
      stop();
      vi.unstubAllGlobals();
    },
  };
}

it("re-scrolls a followed transcript once per resize animation frame", () => {
  const view = harness();
  try {
    view.observer.trigger();
    view.observer.trigger();
    expect(view.scrollToEnd).not.toHaveBeenCalled();
    expect(view.frameCount()).toBe(1);

    view.flushFrame();
    expect(view.scrollToEnd).toHaveBeenCalledOnce();

    view.observer.trigger();
    view.flushFrame();
    expect(view.scrollToEnd).toHaveBeenCalledTimes(2);
  } finally {
    view.dispose();
  }
});

it("does not yank a transcript after the operator scrolls away", () => {
  const view = harness();
  try {
    view.setFollow(false);
    view.observer.trigger();
    expect(view.frameCount()).toBe(0);

    view.setFollow(true);
    view.observer.trigger();
    expect(view.frameCount()).toBe(1);
    view.setFollow(false);
    view.flushFrame();
    expect(view.scrollToEnd).not.toHaveBeenCalled();
  } finally {
    view.dispose();
  }
});

it("drops a pending resize scroll when the transcript unmounts", () => {
  const view = harness();
  view.observer.trigger();
  view.stop();
  view.flushFrame();
  expect(view.scrollToEnd).not.toHaveBeenCalled();
  expect(view.observer.disconnect).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});
