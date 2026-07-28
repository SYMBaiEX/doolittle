import { describe, expect, it } from "vitest";
import {
  compactDuration,
  orchestrationStatusTier,
  orchestrationTimingLabel,
} from "./orchestration-helpers";

describe("orchestration helpers", () => {
  it("maps live board statuses into stable tiers", () => {
    expect(orchestrationStatusTier("running")).toBe("running");
    expect(orchestrationStatusTier("draft")).toBe("approval");
    expect(orchestrationStatusTier("pending")).toBe("queued");
    expect(orchestrationStatusTier("completed")).toBe("completed");
    expect(orchestrationStatusTier("cancelled")).toBe("failed");
    expect(orchestrationStatusTier("idle")).toBe("idle");
  });

  it("formats compact elapsed durations for long-running work", () => {
    expect(compactDuration(45_000)).toBe("<1m");
    expect(compactDuration(30 * 60_000)).toBe("30m");
    expect(compactDuration(125 * 60_000)).toBe("2h 5m");
    expect(compactDuration(49 * 60 * 60_000)).toBe("2d 1h");
  });

  it("builds queue, live, and completion timing labels", () => {
    const now = Date.parse("2026-07-27T18:00:00.000Z");

    expect(
      orchestrationTimingLabel({
        status: "pending",
        createdAt: "2026-07-27T17:15:00.000Z",
        now,
      }),
    ).toBe("Queued 45m");

    expect(
      orchestrationTimingLabel({
        status: "running",
        startedAt: "2026-07-27T17:45:00.000Z",
        now,
      }),
    ).toBe("Live 15m");

    expect(
      orchestrationTimingLabel({
        status: "completed",
        startedAt: "2026-07-27T16:00:00.000Z",
        completedAt: "2026-07-27T17:30:00.000Z",
        now,
      }),
    ).toBe("Done in 1h 30m");
  });
});
