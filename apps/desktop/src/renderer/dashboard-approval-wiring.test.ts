import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardPage = readFileSync(
  new URL("./DashboardPage.tsx", import.meta.url),
  "utf8",
);
const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("dashboard approval resource wiring", () => {
  it("uses the shell approval resource instead of creating a duplicate request", () => {
    expect(dashboardPage).toContain("approvalsResource: approvals");
    expect(dashboardPage).not.toMatch(
      /useApiResource<[^>]+>\(\s*active \? "\/execution\/approvals\?status=pending"/s,
    );
    expect(app).toContain("approvalsResource={approvalsResource}");
  });
});
