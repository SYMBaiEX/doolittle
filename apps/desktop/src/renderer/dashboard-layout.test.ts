import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VIEW_PRIMITIVES_CLASS } from "./app-shell/view-layout";

const dashboardPage = readFileSync(
  new URL("./DashboardPage.tsx", import.meta.url),
  "utf8",
);
const dashboardLayout = readFileSync(
  new URL("./dashboard/dashboard-layout.ts", import.meta.url),
  "utf8",
);
const priorityPanel = readFileSync(
  new URL("./dashboard/DashboardPriorityPanel.tsx", import.meta.url),
  "utf8",
);
const activityPanels = readFileSync(
  new URL("./dashboard/DashboardActivityPanels.tsx", import.meta.url),
  "utf8",
);
const runtimeDetails = readFileSync(
  new URL("./dashboard/DashboardRuntimeDetails.tsx", import.meta.url),
  "utf8",
);

describe("dashboard operator metric layout", () => {
  it("uses the shared compact summary rail for workspace facts", () => {
    expect(dashboardPage).not.toContain('aria-label="Operator state"');
    expect(dashboardPage).not.toContain("dashboard-status-rail");
    expect(dashboardPage).not.toContain("dashboard-pressure-line");
    expect(dashboardLayout).not.toContain("dashboard-status-rail");
    expect(dashboardPage).toContain("<DashboardPriorityPanel");
    expect(priorityPanel).toContain("<CompactStatStrip");
    for (const label of [
      "Agent accounts",
      "Conversations",
      "Runtime plugins",
      "Workspace branch",
    ]) {
      expect(priorityPanel).toContain(`label: "${label}"`);
    }
    expect(dashboardPage).not.toContain("dashboard-inline-metrics");
    expect(dashboardLayout).not.toContain("dashboard-inline-metrics");
  });

  it("keeps duplicate runtime and account diagnostics behind one disclosure", () => {
    expect(dashboardPage).not.toContain(
      '<div className="metric-grid compact">',
    );
    expect(runtimeDetails).toContain("dashboard-workspace-details");
    expect(runtimeDetails).toContain("DASHBOARD_DISCLOSURE_CLASS");
    expect(priorityPanel).toContain('<details className="group mt-[9px]');
    expect(runtimeDetails).toContain("Runtime &amp; agent accounts");
    expect(runtimeDetails).toContain("grid-cols-2");
  });

  it("lets dashboard sections scroll at their natural height without stretching empty panels", () => {
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[&:not(.view-chat):not(.view-code):not(.view-review):not(.view-orchestration)>.page>*]:shrink-0",
    );
    expect(dashboardLayout).toContain("items-start");
    expect(activityPanels).toContain('"Sessions" : "No saved sessions"');
    expect(activityPanels).toContain('"Approvals and tasks" : "Queue clear"');
    expect(activityPanels).toContain("flex min-h-[72px] items-center");
  });
});
