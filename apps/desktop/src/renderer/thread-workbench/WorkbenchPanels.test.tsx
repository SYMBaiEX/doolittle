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
  selectedTab: "changes" | "plans" | "preview" | "settings",
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
    fileEntries: [],
    changeEntries: [],
    commandEntries: [],
    approvalEntries: [],
    delegatedTaskEntries: [],
    settingEntries: [],
    repositorySummary: { isRepository: false },
    branches: { data: null },
    conflicts: { data: null },
    remotes: { data: null },
    stashes: { data: null },
    worktrees: { data: null },
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

function render(selectedTab: "changes" | "plans" | "preview" | "settings") {
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
    expect(markup).toContain('class="thread-workbench-panel"');
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

  it("defers secondary checkpoint and full-page navigation controls", () => {
    const changes = render("changes");
    const settings = render("settings");
    expect(changes).toContain('class="thread-workbench-checkpoints"');
    expect(changes).not.toContain(
      '<details class="thread-workbench-checkpoints" open=""',
    );
    expect(settings).toContain('class="thread-workbench-settings-nav"');
    expect(settings).toContain("Open a full page");
    expect(settings).not.toContain("Open full-screen navigation");
  });
});
