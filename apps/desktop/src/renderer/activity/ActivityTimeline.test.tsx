import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActivityTimeline } from "./ActivityTimeline";

describe("ActivityTimeline", () => {
  it("preserves event context, audit counts, and progressive disclosure", () => {
    const markup = renderToStaticMarkup(
      <ActivityTimeline
        filteredCount={22}
        groups={[
          {
            count: 2,
            event: {
              id: "event-1",
              kind: "chat-run",
              occurredAt: "2026-08-12T10:00:00Z",
              safeSummary: "2 chat runs completed with 3 recorded actions.",
              sourceId: "run-1",
              status: "succeeded",
              target: "chat",
              title: "Chat run completed",
            },
            summary: "2 chat runs completed with 3 recorded actions.",
          },
        ]}
        onShowMore={vi.fn()}
        remainingGroups={20}
        totalCount={30}
      />,
    );

    expect(markup).toContain("Operator stream");
    expect(markup).toContain("succeeded · chat · 2 events");
    expect(markup).toContain("3 recorded actions");
    expect(markup).toContain("20 older groups");
    expect(markup).toContain("Show next 20");
  });
});
