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

describe("dashboard operator metric layout", () => {
  it("keeps the four inline metrics in a deterministic responsive grid", () => {
    expect(dashboardPage).toContain(
      '<div className="dashboard-inline-metrics">',
    );
    expect(
      dashboardPage.match(
        /<span>(?:Spawned-agent accounts|Provider|Model|Workspace branch)<\/span>/gu,
      ),
    ).toHaveLength(4);
    expect(dashboardCss).toMatch(
      /\.dashboard-inline-metrics\s*{[^}]*grid-template-columns:\s*repeat\(4,/s,
    );
    expect(dashboardCss).toMatch(
      /@media \(max-width: 980px\)[\s\S]*?\.dashboard-inline-metrics\s*{[^}]*grid-template-columns:\s*repeat\(2,/s,
    );
    expect(dashboardCss).toMatch(
      /@media \(max-width: 620px\)[\s\S]*?\.dashboard-inline-metrics\s*{[^}]*grid-template-columns:\s*1fr;/s,
    );
  });
});
