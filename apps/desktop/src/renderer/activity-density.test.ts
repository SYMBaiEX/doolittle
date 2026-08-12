import { describe, expect, it } from "vitest";
import {
  ACTIVITY_PAGE_SIZE,
  activitySummaryIsDistinct,
  groupConsecutiveActivityEvents,
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

  it("groups only consecutive duplicate events while retaining audit counts", () => {
    const event = (id: string, title: string) => ({
      id,
      kind: "repository-change",
      safeSummary: "File paths are intentionally omitted.",
      status: "recorded",
      target: "workspace",
      title,
    });

    expect(
      groupConsecutiveActivityEvents([
        event("1", "Repository change observed"),
        event("2", "Repository change observed"),
        event("3", "Runtime restarted"),
        event("4", "Repository change observed"),
      ]),
    ).toEqual([
      { count: 2, event: event("1", "Repository change observed") },
      { count: 1, event: event("3", "Runtime restarted") },
      { count: 1, event: event("4", "Repository change observed") },
    ]);
  });
});
