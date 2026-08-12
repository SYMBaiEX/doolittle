import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardPage = readFileSync(
  new URL("./DashboardPage.tsx", import.meta.url),
  "utf8",
);
const dashboardCss = readFileSync(
  new URL("./dashboard.css", import.meta.url),
  "utf8",
);
const appPolishCss = readFileSync(
  new URL("./app-polish.css", import.meta.url),
  "utf8",
);

describe("dashboard operator metric layout", () => {
  it("uses the shared compact summary rail for workspace facts", () => {
    expect(dashboardPage).toContain("<CompactStatStrip");
    for (const label of [
      "Agent accounts",
      "Conversations",
      "Runtime plugins",
      "Workspace branch",
    ]) {
      expect(dashboardPage).toContain(`label: "${label}"`);
    }
    expect(dashboardPage).not.toContain("dashboard-inline-metrics");
    expect(dashboardCss).not.toContain(".dashboard-inline-metrics");
  });

  it("keeps duplicate runtime and account diagnostics behind one disclosure", () => {
    expect(dashboardPage).not.toContain(
      '<div className="metric-grid compact">',
    );
    expect(dashboardPage).toContain(
      '<details className="dashboard-runtime-details">',
    );
    expect(dashboardPage).toContain(
      '<details className="dashboard-workspace-details">',
    );
    expect(dashboardPage).toContain("Runtime &amp; agent accounts");
    expect(dashboardCss).toMatch(
      /\.dashboard-runtime-grid\s*{[^}]*grid-template-columns:\s*repeat\(2,/s,
    );
  });

  it("lets dashboard sections scroll at their natural height without stretching empty panels", () => {
    expect(appPolishCss).toMatch(
      /\.view-container:not\(\.view-chat, \.view-code, \.view-review, \.view-orchestration\)[\s\S]*?> \.page[\s\S]*?> \*\s*{[^}]*flex-shrink:\s*0;/s,
    );
    expect(dashboardCss).toMatch(
      /\.dashboard-mini-grid\s*{[^}]*align-items:\s*start;/s,
    );
  });
});
