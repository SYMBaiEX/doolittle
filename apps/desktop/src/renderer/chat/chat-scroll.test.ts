import { describe, expect, it, vi } from "vitest";
import { isChatNearBottom, scheduleChatScroll } from "./chat-scroll";

describe("chat transcript scrolling", () => {
  it("follows when the transcript is within the bottom threshold", () => {
    expect(
      isChatNearBottom({
        clientHeight: 400,
        scrollHeight: 1_000,
        scrollTop: 552,
      }),
    ).toBe(true);
    expect(
      isChatNearBottom({
        clientHeight: 400,
        scrollHeight: 1_000,
        scrollTop: 500,
      }),
    ).toBe(false);
  });

  it("preserves a user scroll above the bottom", () => {
    expect(
      isChatNearBottom({
        clientHeight: 400,
        scrollHeight: 1_000,
        scrollTop: 300,
      }),
    ).toBe(false);
  });

  it("schedules at most one scroll per animation frame", () => {
    let callback: FrameRequestCallback | undefined;
    const scheduleFrame = vi.fn((next: FrameRequestCallback) => {
      callback = next;
      return 1;
    });
    const scroll = vi.fn();
    const schedule = scheduleChatScroll(scheduleFrame, scroll);

    schedule();
    schedule();
    expect(scheduleFrame).toHaveBeenCalledOnce();
    expect(scroll).not.toHaveBeenCalled();

    callback?.(0);
    expect(scroll).toHaveBeenCalledOnce();
    schedule();
    expect(scheduleFrame).toHaveBeenCalledTimes(2);
  });
});
