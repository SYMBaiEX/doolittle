import { describe, expect, it } from "vitest";
import { ACTIVITY_PAGE_SIZE, visibleActivityWindow } from "./ActivityPage";

describe("ActivityPage density", () => {
  it("bounds the initial timeline and expands in predictable pages", () => {
    const events = Array.from({ length: 63 }, (_, index) => index);

    expect(visibleActivityWindow(events, ACTIVITY_PAGE_SIZE)).toHaveLength(20);
    expect(visibleActivityWindow(events, ACTIVITY_PAGE_SIZE * 2)).toHaveLength(
      40,
    );
    expect(visibleActivityWindow(events, 80)).toHaveLength(63);
  });
});
