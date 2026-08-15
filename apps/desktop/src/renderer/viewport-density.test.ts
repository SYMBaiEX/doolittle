import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VIEW_PRIMITIVES_CLASS } from "./app-shell/view-layout";
import { CHAT_WORKSPACE_CLASS } from "./chat/layout";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("wide route viewport density", () => {
  it("uses compact shared route geometry and restores focused chat line lengths", () => {
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "[padding-block:var(--page-pad-block)]",
    );
    expect(VIEW_PRIMITIVES_CLASS).toContain(
      "min-h-[var(--page-header-min-height)]",
    );
    expect(VIEW_PRIMITIVES_CLASS).toContain("text-[var(--page-title-size)]");
    expect(CHAT_WORKSPACE_CLASS).toContain("w-[min(100%,700px)]");
    expect(CHAT_WORKSPACE_CLASS).toContain("w-[min(100%,880px)]");
    expect(CHAT_WORKSPACE_CLASS).toContain("w-[min(calc(100%_-_36px),820px)]");
  });

  it("bounds dashboard and observability content while preserving responsive stacks", () => {
    const dashboardPage = source("./DashboardPage.tsx");
    const dashboardLayout = source("./dashboard/dashboard-layout.ts");
    const observabilityLayout = source("./observability-layout.ts");

    expect(dashboardPage).toContain("DASHBOARD_PAGE_CLASS");
    expect(dashboardLayout).toContain("w-[min(100%,1320px)]");
    expect(dashboardLayout).toContain("max-[980px]:grid-cols-1");
    expect(observabilityLayout).toContain("mx-auto");
    expect(observabilityLayout).toContain("max-w-[1280px]");
  });

  it("keeps settings compact and profile choices side by side until mobile", () => {
    const settingsLayout = source("./settings/settings-layout.ts");
    const settingsPage = source("./SettingsPage.tsx");
    const profilesPage = source("./ProfilesPage.tsx");

    expect(settingsPage).toContain("SETTINGS_PAGE_CLASS");
    expect(settingsLayout).toContain("grid-cols-[156px_minmax(0,1fr)]");
    expect(settingsLayout).toContain("max-[980px]:grid-cols-1");
    expect(profilesPage).toContain(
      "min-[701px]:grid-cols-[minmax(18rem,0.42fr)_minmax(0,0.58fr)]",
    );
    expect(profilesPage).toContain('className="profile-picker grid');
  });

  it("focuses zero-work orchestration and review states without full-width strips", () => {
    const orchestration = source("./OrchestrationPage.tsx");
    const orchestrationLayout = source("./orchestration/layout.ts");
    const reviewLayout = source("./review/layout.ts");

    expect(orchestration).toContain("shouldShowOrchestrationSummary");
    expect(orchestration).toContain("tasks.length > 0 ? (");
    expect(orchestrationLayout).toContain("w-[min(calc(100%_-_24px),920px)]");
    expect(orchestrationLayout).toContain("mt-[clamp(12px,6vh,72px)]");
    expect(orchestrationLayout).toContain("mx-auto");
    expect(reviewLayout).toContain("w-[min(100%,920px)]");
    expect(reviewLayout).toContain("self-center");
    expect(reviewLayout).toContain("mt-[clamp(12px,6vh,72px)]");
  });
});
