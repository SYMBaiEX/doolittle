import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WorkbenchController } from "./models";
import { WorkbenchPanels, type WorkbenchPanelsProps } from "./WorkbenchPanels";

vi.mock("../components/ThreadWorkbenchFilesPanel", () => ({
  ThreadWorkbenchFilesPanel: () => createElement("div"),
}));
vi.mock("../components/GitControlPanel", () => ({
  GitControlPanel: () => createElement("div"),
}));

function controller(
  selectedTab: "brief" | "changes" | "plans" | "preview" | "settings",
): WorkbenchController {
  return {
    model: { branch: "main", head: "12345678", selectedTab },
    preview: { data: null, error: "", loading: false, reload: vi.fn() },
    plans: {
      data: selectedTab === "plans" ? { plans: [] } : null,
      error: "",
      loading: false,
      reload: vi.fn(),
    },
    planEntries: [],
    briefPlanSummary: {
      activePlan: null,
      draftCount: 0,
    },
    fileEntries: [],
    changeEntries: [],
    commandEntries: [],
    approvalEntries: [],
    delegatedTaskEntries: [],
    settingEntries: [],
    runEntries: [],
    activeRunCount: 0,
    failedRunCount: 0,
    repositorySummary: { isRepository: false },
    branches: { data: null },
    conflicts: { data: null },
    remotes: { data: null },
    stashes: { data: null },
    worktrees: { data: null },
    delegationTasks: { data: null, error: "", loading: false, reload: vi.fn() },
    codegen: {
      data: { summary: { total: 0 } },
      error: "",
      loading: false,
      reload: vi.fn(),
    },
    approvals: { data: null, error: "", loading: false, reload: vi.fn() },
    terminal: { data: null, error: "", loading: false, reload: vi.fn() },
    refreshGit: vi.fn(),
    checkpoints: {
      data: { checkpoints: [], support: { supported: false } },
    },
    checkpointBusy: false,
    createCheckpoint: vi.fn(),
    checkpointMessage: "",
    restoreCheckpoint: vi.fn(),
    changes: { data: null, error: "", loading: false, reload: vi.fn() },
    currentChange: "",
    patch: { data: null, error: "", loading: false, reload: vi.fn() },
    setSelectedChange: vi.fn(),
    insert: vi.fn(),
    settings: { data: null, error: "", loading: false, reload: vi.fn() },
  } as unknown as WorkbenchController;
}

function render(
  selectedTab: "brief" | "changes" | "plans" | "preview" | "settings",
) {
  const props: WorkbenchPanelsProps = {
    controller: controller(selectedTab),
    onOpenFullView: vi.fn(),
    workspacePath: "/work/doolittle",
  };
  return renderToStaticMarkup(<WorkbenchPanels {...props} />);
}

describe("WorkbenchPanels", () => {
  it("keeps the plans tab heading and empty state in the extracted panel", () => {
    const markup = render("plans");
    expect(markup).toContain('data-thread-workbench="panel"');
    expect(markup).toContain("Plans");
    expect(markup).toContain("0 plans");
    expect(markup).not.toContain("Module 04");
    expect(markup).toContain("No plans are attached to the local runtime.");
  });

  it("keeps preview status in the preview panel", () => {
    const markup = render("preview");
    expect(markup).toContain("Local preview tools are connected");
    expect(markup).toContain("Available");
  });

  it("renders the brief tab as a terse operational summary without duplicate workspace facts", () => {
    const markup = render("brief");
    expect(markup).toContain("Current plan");
    expect(markup).toContain("No active plan.");
    expect(markup).toContain("No queued delegation tasks.");
    expect(markup).toContain("No terminal history yet.");
    expect(markup).toContain('data-thread-workbench="empty"');
    expect(markup).toContain(">Add plan context</button>");
    expect(markup).not.toContain("Workspace pulse");
    expect(markup).not.toContain("Dirty files");
    expect(markup).not.toContain("Repository");
  });

  it("defers secondary checkpoint and full-page navigation controls", () => {
    const changes = render("changes");
    const settings = render("settings");
    expect(changes).toContain('data-thread-workbench="checkpoints"');
    expect(changes).not.toContain(
      '<details data-thread-workbench="checkpoints" open=""',
    );
    expect(settings).toContain('data-thread-workbench="settings-navigation"');
    expect(settings).toContain("Open a full page");
    expect(settings).not.toContain("Open full-screen navigation");
  });
});
