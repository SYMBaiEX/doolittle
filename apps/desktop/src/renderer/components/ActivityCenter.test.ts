import { describe, expect, it } from "vitest";
import {
  type ActivityCenterEvent,
  activityNeedsAttention,
  activityStatusLabel,
  activityTargetLabel,
  orderActivityEvents,
} from "./ActivityCenter";

function event(
  id: string,
  occurredAt: string,
  overrides: Partial<ActivityCenterEvent> = {},
): ActivityCenterEvent {
  return {
    id,
    kind: "chat-run",
    sourceId: id,
    status: "succeeded",
    occurredAt,
    title: "Chat run completed",
    safeSummary: "Chat run completed with one recorded action.",
    target: "chat",
    ...overrides,
  };
}

describe("ActivityCenter helpers", () => {
  it("orders newest first, uses ids as a stable tie-breaker, and deduplicates", () => {
    const older = event("older", "2026-07-28T10:00:00.000Z");
    const tiedA = event("a", "2026-07-28T11:00:00.000Z");
    const tiedB = event("b", "2026-07-28T11:00:00.000Z");

    expect(orderActivityEvents([older, tiedA, tiedB, tiedA])).toEqual([
      tiedB,
      tiedA,
      older,
    ]);
  });

  it("maps statuses to compact operator-facing labels", () => {
    expect(activityStatusLabel("pending", "approval")).toBe("Needs review");
    expect(activityStatusLabel("pending", "delegation")).toBe("Queued");
    expect(activityStatusLabel("running")).toBe("In progress");
    expect(activityStatusLabel("succeeded")).toBe("Completed");
    expect(activityStatusLabel("delivered")).toBe("Delivered");
  });

  it("maps navigation targets and identifies attention states", () => {
    expect(activityTargetLabel("chat")).toBe("Open chat");
    expect(activityTargetLabel("review")).toBe("Open review");
    expect(activityTargetLabel("automations")).toBe("Open automations");
    expect(activityTargetLabel("orchestration")).toBe("Open tasks");

    expect(
      activityNeedsAttention(
        event("approval", "2026-07-28T11:00:00.000Z", {
          kind: "approval",
          status: "pending",
          target: "review",
        }),
      ),
    ).toBe(true);
    expect(
      activityNeedsAttention(
        event("delivery", "2026-07-28T11:00:00.000Z", {
          kind: "delivery",
          status: "delivered",
        }),
      ),
    ).toBe(false);
  });
});
