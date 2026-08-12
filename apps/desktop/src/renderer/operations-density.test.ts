import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("operational route density", () => {
  it("uses the shared summary rail instead of repeated metric cards", () => {
    for (const path of [
      "./ActivityPage.tsx",
      "./AutomationsPage.tsx",
      "./GatewayPage.tsx",
      "./LogsPage.tsx",
      "./ToolsPage.tsx",
      "./SkillsPage.tsx",
      "./PluginsPage.tsx",
      "./DocsPage.tsx",
      "./DashboardPage.tsx",
      "./SetupPage.tsx",
      "./runtime/RuntimeOverview.tsx",
      "./runtime/RuntimeInventory.tsx",
      "./runtime/RuntimeGateway.tsx",
      "./sessions/SessionDetail.tsx",
      "./analytics/AnalyticsPage.tsx",
      "./memory/MemoryProfilesPanel.tsx",
      "./memory/MemorySnapshotPanel.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toContain("<CompactStatStrip");
      expect(source, path).not.toContain("<MetricCard");
    }

    expect(read("./lib.tsx")).not.toContain("export function MetricCard");
    for (const path of [
      "./styles.css",
      "./experience.css",
      "./app-polish.css",
    ]) {
      expect(read(path), path).not.toContain(".metric-card");
      expect(read(path), path).not.toContain(".metric-grid");
    }
  });

  it("keeps secondary operational diagnostics closed until requested", () => {
    expect(read("./LogsPage.tsx")).toContain(
      'className="operations-trace-details"',
    );
    expect(read("./LogsPage.tsx")).toContain(
      'active && historyOpen ? "/deliveries" : null',
    );
    expect(read("./LogsPage.tsx")).toContain(
      'active && historyOpen ? "/terminal/history" : null',
    );
    expect(read("./gateway/GatewayTimelinePanel.tsx")).toContain(
      '<details className="gateway-entry-details">',
    );
    expect(read("./CompatibilityPage.tsx")).not.toContain(
      '<section className="content-card" style=',
    );
  });

  it("reuses the native skill summary instead of fetching installed skills twice", () => {
    const skills = read("./SkillsPage.tsx");

    expect(skills).toContain("asArray(summary.data?.installed)");
    expect(skills).not.toContain('"/skills/installed"');
  });

  it("reuses the native tool inventory summary instead of computing it twice", () => {
    const tools = read("./ToolsPage.tsx");

    expect(tools).toContain("tools.data?.summary");
    expect(tools).not.toContain('"/tools/summary');
  });

  it("defers setup guidance until the checklist disclosure is opened", () => {
    const setup = read("./SetupPage.tsx");

    expect(setup).toContain("requestPolicy.checklist");
    expect(setup).toContain("checklistOpen ? (");
    expect(setup).toContain("Open to load");
  });

  it("uses the runtime doctor as the single health source on the About page", () => {
    const docs = read("./DocsPage.tsx");

    expect(docs).toContain('active ? "/doctor" : null');
    expect(docs).not.toContain('"/setup/summary"');
    expect(docs).not.toContain("runtime answered successfully");
  });

  it("keeps the primary model readiness visible and capability detail optional", () => {
    const models = read("./ModelsPage.tsx");
    expect(
      models.match(/<details className="model-diagnostic"/gu),
    ).toHaveLength(2);
    expect(models).toContain('<details className="model-diagnostic" open>');
    expect(models).toContain('<details className="model-diagnostic">');
  });
});
