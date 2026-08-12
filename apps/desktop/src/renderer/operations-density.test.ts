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

  it("reuses one native skill projection instead of fetching summary data twice", () => {
    const skills = read("./SkillsPage.tsx");

    expect(skills).toContain("asArray(skills.data?.installed)");
    expect(skills).not.toContain('"/skills/summary"');
    expect(skills).not.toContain('"/skills/installed"');
    expect(skills).not.toContain('status: "Available"');
  });

  it("uses row status for catalog exceptions instead of repeating healthy state", () => {
    expect(read("./ToolsPage.tsx")).toContain(
      'catalogExceptionStatus(entry.enabled !== false, "Disabled")',
    );
    expect(read("./PluginsPage.tsx")).toContain(
      'catalogExceptionStatus(Boolean(entry.enabled), "Inactive")',
    );
  });

  it("requests only the native plugin catalog on inventory screens", () => {
    expect(read("./PluginsPage.tsx")).toContain(
      '"/runtime/plugins?view=catalog"',
    );
    expect(read("./RuntimePage.tsx")).toContain(
      '"/runtime/plugins?view=catalog"',
    );
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

    expect(docs).toContain("doctorResourcePath(active, doctorRequested)");
    expect(docs).toContain('return active && requested ? "/doctor" : null');
    expect(docs).not.toContain('"/setup/summary"');
    expect(docs).not.toContain("runtime answered successfully");
  });

  it("reuses shell-owned dashboard state instead of refetching it on navigation", () => {
    const dashboard = read("./DashboardPage.tsx");

    expect(dashboard).toContain("tasksResource: tasks");
    expect(dashboard).toContain("sessions: readonly SessionSummary[]");
    expect(dashboard).toContain("runtime: RuntimeStatus | null");
    expect(dashboard).not.toContain('"/runtime/status"');
    expect(dashboard).not.toContain('"/sessions?limit=8"');
    expect(dashboard).not.toContain('"/delegation/tasks?status=running');
  });

  it("loads and polls the shell activity feed only while the utility drawer is visible", () => {
    const app = read("./App.tsx");

    expect(app).toContain(
      'backend.phase === "ready" && utilityOpen ? "/activity?limit=50" : null',
    );
    expect(app).toContain("if (utilityOpen) activityResource.reload();");
  });

  it("defers automation trace receipts behind a compact disclosure", () => {
    const automations = read("./AutomationsPage.tsx");
    const workspace = read("./automations/AutomationWorkspace.tsx");

    expect(automations).toContain("resourcePolicy.runs");
    expect(automations).toContain(
      'detail: runsOpen ? "Durable trace receipts" : "Open to load"',
    );
    expect(workspace).toContain(
      'className="content-card automation-runs-panel"',
    );
    expect(workspace).toMatch(
      /runsOpen \? `\$\{runs\.length\} loaded` : "Open to load"/u,
    );
  });

  it("uses compact empty states for zero-data inventory panes", () => {
    expect(read("./analytics/AnalyticsPage.tsx")).toContain(
      '<EmptyBlock density="compact" title="No activity yet">',
    );
    const automationWorkspace = read("./automations/AutomationWorkspace.tsx");
    expect(automationWorkspace).toContain(
      'className="automation-empty-starter"',
    );
    expect(automationWorkspace).toContain("Use New automation above");
    expect(automationWorkspace).not.toContain('title="No automations yet"');
    const memory = read("./memory/MemorySnapshotPanel.tsx");
    expect(memory).toContain("memory-empty-card");
    expect(memory).toContain("No stored entries yet");
    expect(memory).toContain("{preview.length ? (");
  });

  it("loads shell-owned desktop state only on its category, even offline", () => {
    const settings = read("./SettingsPage.tsx");

    expect(settings).toContain('desktop: category === "desktop"');
    expect(settings).toContain(
      '!active && !["appearance", "desktop"].includes(category)',
    );
    expect(settings).toContain("if (!resourcePolicy.desktop) return;");
    expect(settings).toContain("[resourcePolicy.desktop]");
  });

  it("keeps the primary model readiness visible and capability detail optional", () => {
    const models = read("./ModelsPage.tsx");
    expect(models.match(/className="model-diagnostic"/gu)).toHaveLength(2);
    expect(models).toContain("resourcePolicy.accounts");
    expect(models).toMatch(/readinessOpen\s+\?\s+`\$\{usableProviderCount\}/u);
    expect(models).toContain('className="model-diagnostic"');
    expect(models).not.toContain('<details className="model-diagnostic" open>');
  });
});
