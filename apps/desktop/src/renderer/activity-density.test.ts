import { describe, expect, it } from "vitest";
import {
  ACTIVITY_PAGE_SIZE,
  activitySummaryIsDistinct,
  visibleActivityWindow,
} from "./ActivityPage";

describe("ActivityPage density", () => {
  it("bounds the initial timeline and expands in predictable pages", () => {
    const events = Array.from({ length: 63 }, (_, index) => index);

    expect(visibleActivityWindow(events, ACTIVITY_PAGE_SIZE)).toHaveLength(20);
    expect(visibleActivityWindow(events, ACTIVITY_PAGE_SIZE * 2)).toHaveLength(
      40,
    );
    expect(visibleActivityWindow(events, 80)).toHaveLength(63);
  });

  it("suppresses summaries that merely repeat the event title", () => {
    expect(
      activitySummaryIsDistinct(
        "Delegated task queued",
        "Delegated task queued.",
      ),
    ).toBe(false);
    expect(
      activitySummaryIsDistinct(
        "Delegated task queued",
        "Waiting for an available coding account.",
      ),
    ).toBe(true);
    expect(activitySummaryIsDistinct("Run finished", " ")).toBe(false);
  });
});
