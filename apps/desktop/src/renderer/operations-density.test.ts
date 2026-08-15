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
      "./dashboard/DashboardPriorityPanel.tsx",
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
    expect(read("./app-shell/view-layout.ts")).not.toContain("metric-card");
    expect(read("./app-shell/view-layout.ts")).not.toContain("metric-grid");
  });

  it("keeps observability density route-scoped and responsive without route CSS", () => {
    const layout = read("./observability-layout.ts");
    const activity = read("./activity/ActivityTimeline.tsx");
    const analytics = read("./analytics/AnalyticsPage.tsx");
    const logs = read("./LogsPage.tsx");

    expect(layout).toContain("max-[700px]:grid-cols-1");
    expect(activity).toContain('data-activity-entry="true"');
    expect(analytics).toContain("max-[1120px]:grid-cols-1");
    expect(analytics).toContain("max-[700px]:flex-col");
    expect(logs).toContain("h-[clamp(18rem,56vh,35rem)]");
  });

  it("keeps secondary operational diagnostics closed until requested", () => {
    expect(read("./LogsPage.tsx")).toContain('data-operations-traces="true"');
    expect(read("./LogsPage.tsx")).toContain(
      'active && historyOpen ? "/deliveries" : null',
    );
    expect(read("./LogsPage.tsx")).toContain(
      'active && historyOpen ? "/terminal/history" : null',
    );
    expect(read("./gateway/GatewayTimelinePanel.tsx")).toContain(
      '<details className="group block pt-px',
    );
    expect(read("./CompatibilityPage.tsx")).not.toContain(
      '<section className="content-card" style=',
    );
  });

  it("reuses one native skill projection instead of fetching summary data twice", () => {
    const skills = read("./SkillsPage.tsx");

    expect(skills).toContain("asArray(catalogData?.installed)");
    expect(skills).not.toContain('"/skills/summary"');
    expect(skills).not.toContain('"/skills/installed"');
    expect(skills).not.toContain('status: "Available"');
  });

  it("uses row status for catalog exceptions instead of repeating healthy state", () => {
    const toolCatalog = read("./tools/ToolCatalogWorkspace.tsx");
    expect(toolCatalog).toContain(
      '!item.enabled ? <Badge tone="warn">Disabled</Badge> : null',
    );
    expect(toolCatalog).not.toContain(
      'item.enabled ? <Badge tone="good">Available</Badge>',
    );
    const pluginCatalog = read("./plugins/PluginCatalogWorkspace.tsx");
    expect(pluginCatalog).toContain(
      '!item.enabled ? <Badge tone="warn">Inactive</Badge> : null',
    );
    expect(pluginCatalog).not.toContain(
      'item.enabled ? <Badge tone="good">Enabled</Badge>',
    );
    const skillCatalog = read("./skills/SkillCatalogWorkspace.tsx");
    expect(skillCatalog).toContain(
      "!item.userInvocable && !item.modelInvocable ? (",
    );
    expect(skillCatalog).not.toContain(
      'item.userInvocable ? <Badge tone="good">Invocable</Badge>',
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

    expect(tools).toContain("const totals = catalogData?.summary ?? {};");
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
    const history = read("./automations/AutomationRunHistory.tsx");

    expect(automations).toContain("resourcePolicy.runs");
    expect(automations).toContain(
      'detail: runsOpen ? "Durable trace receipts" : "Open to load"',
    );
    expect(workspace).toContain("<AutomationRunHistory");
    expect(history).toContain("automation-runs-panel");
    expect(history).toContain('quiet ? "Run history" : "Trace receipts"');
    expect(history).toContain('"View past runs"');
    expect(history).toContain('"Open to load"');
  });

  it("uses compact empty states for zero-data inventory panes", () => {
    const analytics = read("./analytics/AnalyticsPage.tsx");
    expect(analytics).toContain('data-analytics-empty="true"');
    expect(analytics).toContain("Start conversation");
    expect(analytics).toContain("!hasActivity ? (");
    const automationWorkspace = read("./automations/AutomationWorkspace.tsx");
    expect(automationWorkspace).toContain("automation-empty-starter flex");
    expect(automationWorkspace).toContain("Build your first workflow");
    expect(automationWorkspace).toContain("Blank workflow");
    expect(automationWorkspace).toContain("Weekday brief");
    expect(automationWorkspace).toContain("Webhook triage");
    expect(automationWorkspace).not.toContain('title="No automations yet"');
    expect(automationWorkspace).toContain("is-empty max-w-225 grid-cols-1");
    const memory = read("./memory/MemorySnapshotPanel.tsx");
    expect(memory).toContain("data-memory-empty");
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
    expect(models.match(/data-model-diagnostic="true"/gu)).toHaveLength(2);
    expect(models).toContain("resourcePolicy.accounts");
    expect(models).toMatch(/readinessOpen\s+\?\s+`\$\{usableProviderCount\}/u);
    expect(models).toContain("MODEL_DIAGNOSTIC_CLASS");
    expect(models).not.toContain('<details className="model-diagnostic" open>');
  });
});
