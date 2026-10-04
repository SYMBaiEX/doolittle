import { readFileSync } from "node:fs";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { VIEW_PRIMITIVES_CLASS } from "./app-shell/view-layout";
import {
  DASHBOARD_CARD_HEADING_CLASS,
  DASHBOARD_STATUS_ROW_CLASS,
} from "./dashboard/dashboard-layout";

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
    expect(priorityPanel).toContain(
      '<details className="group mt-1.5 rounded-[var(--radius-xs)]',
    );
    expect(priorityPanel).not.toContain(
      '<div className="grid border-t border-[var(--border)]">',
    );
    expect(runtimeDetails).toContain("Runtime &amp; agent accounts");
    expect(runtimeDetails).toContain("grid-cols-2");
  });

  it("keeps dashboard cards and diagnostics on the compact operator density", () => {
    expect(dashboardLayout).toContain("p-3");
    expect(dashboardLayout).toContain("min-h-9");
    expect(dashboardLayout).toContain("text-[length:var(--text-control)]");
    expect(dashboardLayout).not.toContain("min-h-[50px]");
    expect(priorityPanel).toContain("min-h-8.5");
    expect(priorityPanel).toContain("mt-1.5");
    expect(priorityPanel).not.toContain("min-h-[38px]");
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

  it("wraps intrinsically sized heading actions instead of shrinking their group past its buttons", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const css = compiler.build(DASHBOARD_CARD_HEADING_CLASS.split(/\s+/u));
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain("> div:last-child:not(:first-child)");
    expect(css).toContain("flex-shrink: 0");
    expect(css).toContain("max-width: 100%");
    expect(css).toContain("white-space: normal !important");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(DASHBOARD_CARD_HEADING_CLASS.split(/\s+/u)).not.toContain(
      "overflow-hidden",
    );
    expect(DASHBOARD_CARD_HEADING_CLASS).not.toContain(
      "[&>div:last-child:not(:first-child)]:overflow-hidden",
    );
    expect(activityPanels).toContain("Review");
    expect(activityPanels).toContain("Tasks");
  });

  it("preserves complete status badges alongside wrapping readable metadata", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const css = compiler.build(DASHBOARD_STATUS_ROW_CLASS.split(/\s+/u));
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain("> div:not(.badge)");
    expect(css).toContain("flex: 1 1 180px");
    expect(css).toContain("> .badge");
    expect(css).toContain("flex-shrink: 0");
    expect(css).toContain("max-width: 100%");
    expect(css).toContain("white-space: normal !important");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(DASHBOARD_STATUS_ROW_CLASS).not.toContain(
      "[&>.badge]:overflow-hidden",
    );
  });
});
