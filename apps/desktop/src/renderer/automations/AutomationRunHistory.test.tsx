import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutomationRunHistory } from "./AutomationRunHistory";

const run = {
  completedAt: "2026-08-12T14:05:00Z",
  id: "run-1",
  jobName: "Morning brief",
  output: "Brief delivered.",
  status: "completed",
  trace: [
    {
      id: "step-1",
      message: "Accepted for delivery.",
      phase: "trigger",
      status: "completed",
    },
  ],
  triggerType: "schedule",
};

describe("AutomationRunHistory", () => {
  it("keeps receipt data unmounted until the disclosure is open", () => {
    const markup = renderToStaticMarkup(
      <AutomationRunHistory
        onOpenChange={vi.fn()}
        onReload={vi.fn()}
        onSelectRun={vi.fn()}
        open={false}
        runs={[run]}
        runsError=""
        runsLoading={false}
        selectedRun={run}
      />,
    );

    expect(markup).toContain("Trace receipts");
    expect(markup).toContain("Open to load");
    expect(markup).not.toContain("Morning brief");
    expect(markup).not.toContain("Brief delivered.");
  });

  it("renders the selected run and durable phase trace when open", () => {
    const markup = renderToStaticMarkup(
      <AutomationRunHistory
        onOpenChange={vi.fn()}
        onReload={vi.fn()}
        onSelectRun={vi.fn()}
        open
        runs={[run]}
        runsError=""
        runsLoading={false}
        selectedRun={run}
      />,
    );

    expect(markup).toContain("1 loaded");
    expect(markup).toContain("Morning brief");
    expect(markup).toContain("Accepted for delivery.");
    expect(markup).toContain("Brief delivered.");
  });
});
