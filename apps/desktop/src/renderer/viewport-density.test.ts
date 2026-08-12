import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("wide route viewport density", () => {
  it("bounds dashboard and observability content while preserving responsive stacks", () => {
    const dashboardPage = source("./DashboardPage.tsx");
    const dashboardCss = source("./dashboard.css");
    const observabilityCss = source("./observability.css");

    expect(dashboardPage).toContain('className="page page-dashboard"');
    expect(dashboardCss).toMatch(
      /\.page-dashboard\s*{[^}]*width:\s*min\(100%, 1320px\);[^}]*margin-inline:\s*auto;/s,
    );
    expect(dashboardCss).toMatch(
      /@media \(max-width: 980px\)[\s\S]*\.page-dashboard \.dashboard-command-grid,[\s\S]*grid-template-columns:\s*1fr;/s,
    );
    expect(observabilityCss).toMatch(
      /\.activity-page,[\s\S]*\.page-analytics\s*{[^}]*width:\s*min\(100%, 1280px\);[^}]*margin-inline:\s*auto;/s,
    );
  });

  it("keeps settings compact and profile choices side by side until mobile", () => {
    const configurationCss = source("./configuration-pages.css");
    const experienceCss = source("./experience.css");
    const profilesCss = source("./profiles.css");

    expect(experienceCss).toMatch(
      /\.page-settings\s*{[^}]*width:\s*min\(100%, 1280px\);/s,
    );
    expect(configurationCss).toMatch(
      /\.page-settings \.settings-layout\s*{[^}]*grid-template-columns:\s*156px minmax\(0, 1fr\);/s,
    );
    expect(profilesCss).toMatch(
      /\.profile-picker\s*{[^}]*grid-template-columns:\s*minmax\(18rem, 0\.42fr\) minmax\(0, 0\.58fr\);/s,
    );
    expect(profilesCss).toMatch(
      /@media \(max-width: 700px\)[\s\S]*\.profile-picker\s*{[^}]*grid-template-columns:\s*1fr;/s,
    );
  });

  it("focuses zero-work orchestration and review states without full-width strips", () => {
    const orchestration = source("./OrchestrationPage.tsx");
    const orchestrationCss = source("./orchestration.css");
    const reviewCss = source("./review.css");

    expect(orchestration).toContain("shouldShowOrchestrationSummary");
    expect(orchestration).toContain("tasks.length > 0 ? (");
    expect(orchestrationCss).toMatch(
      /\.orchestration-queue-starter\s*{[^}]*width:\s*min\(calc\(100% - 24px\), 920px\);[^}]*margin:\s*clamp\(12px, 6vh, 72px\) auto 12px;/s,
    );
    expect(reviewCss).toMatch(
      /\.review-work-overview\.is-empty\s*{[^}]*width:\s*min\(100%, 920px\);[^}]*align-self:\s*center;[^}]*margin-top:\s*clamp\(12px, 6vh, 72px\);/s,
    );
  });
});
