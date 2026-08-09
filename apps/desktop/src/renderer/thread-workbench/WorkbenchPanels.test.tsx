import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WorkbenchController } from "./models";
import { WorkbenchPanels, type WorkbenchPanelsProps } from "./WorkbenchPanels";

vi.mock("../components/ThreadWorkbenchFilesPanel", () => ({
  ThreadWorkbenchFilesPanel: () => createElement("div"),
}));

function controller(selectedTab: "plans" | "preview"): WorkbenchController {
  return {
    model: { selectedTab },
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
  } as unknown as WorkbenchController;
}

function render(selectedTab: "plans" | "preview") {
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
    expect(markup).toContain("No plans are attached to the local runtime.");
  });

  it("keeps preview status in the preview panel", () => {
    const markup = render("preview");
    expect(markup).toContain("Local preview tools are connected");
    expect(markup).toContain("Available");
  });
});
