export const CHAT_SCROLL_BOTTOM_THRESHOLD = 48;

export function isChatNearBottom(
  element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">,
  threshold = CHAT_SCROLL_BOTTOM_THRESHOLD,
): boolean {
  return (
    element.scrollHeight - element.clientHeight - element.scrollTop <= threshold
  );
}

export function scheduleChatScroll(
  scheduleFrame: (callback: FrameRequestCallback) => number,
  scroll: () => void,
): () => void {
  let frame: number | null = null;
  return () => {
    if (frame !== null) return;
    frame = scheduleFrame(() => {
      frame = null;
      scroll();
    });
  };
}

/**
 * Keeps a bottom-pinned transcript attached when layout changes shrink its
 * viewport. The follow state is checked again in the animation frame so a
 * deliberate scroll-up that lands after resize observation is never undone.
 */
export function observeChatTranscriptResize(
  element: HTMLElement,
  shouldFollow: () => boolean,
  scrollToEnd: () => void,
  scheduleFrame: (callback: FrameRequestCallback) => number,
): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  let disposed = false;
  const scheduleScroll = scheduleChatScroll(scheduleFrame, () => {
    if (disposed || !shouldFollow()) return;
    scrollToEnd();
  });
  const observer = new ResizeObserver(() => {
    if (!disposed && shouldFollow()) scheduleScroll();
  });
  observer.observe(element);
  return () => {
    disposed = true;
    observer.disconnect();
  };
}
