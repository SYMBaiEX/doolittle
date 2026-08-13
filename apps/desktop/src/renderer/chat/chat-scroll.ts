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
