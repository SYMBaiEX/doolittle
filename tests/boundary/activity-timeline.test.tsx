// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { ActivityTimeline } from "../../apps/desktop/src/renderer/activity/ActivityTimeline";
import type { ActivityEvent } from "../../apps/desktop/src/shared/contracts";

function activityEvent(
  id: string,
  status: ActivityEvent["status"],
): ActivityEvent {
  return {
    id,
    kind: "automation",
    sourceId: id,
    status,
    occurredAt: "2026-11-27T03:13:00.000Z",
    title:
      status === "failed"
        ? "Automation run failed"
        : "Automation run completed",
    safeSummary: "An automation finished.",
    target: "automations",
  };
}

it("uses outcome color on timeline titles instead of accent for every event", () => {
  const reactEnvironment = globalThis as {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousAct = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    const events = [
      activityEvent("failed-run", "failed"),
      activityEvent("successful-run", "succeeded"),
    ];
    act(() =>
      root.render(
        <ActivityTimeline
          eventCount={events.length}
          groups={events.map((event) => ({
            count: 1,
            event,
            summary: event.safeSummary,
          }))}
          onShowMore={() => {}}
          remainingGroups={0}
        />,
      ),
    );

    const titles = [...host.querySelectorAll("[data-activity-entry] strong")];
    expect(titles[0]?.className).toContain("text-[var(--bad)]");
    expect(titles[1]?.className).toContain("text-[var(--text)]");
    expect(titles[1]?.className).not.toContain("accent-text");
  } finally {
    act(() => root.unmount());
    host.remove();
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
