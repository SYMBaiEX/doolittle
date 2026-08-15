import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThreadWorkbenchRail } from "./ThreadWorkbenchRail";

vi.mock("../thread-workbench-controller", () => ({
  useThreadWorkbenchRailController: () => ({
    model: {
      branch: "main",
      copiedLabel: "",
      environment: "local",
      head: "1234567890abcdef",
      lifecycle: "ready",
      railWidth: 420,
      selectedTab: "brief",
      workspaceName: "doolittle",
      workspacePath: "/work/doolittle",
      worktreePath: "/work/doolittle",
    },
    setModel: vi.fn(),
    copiedLabel: "",
    repositorySummary: {
      changedFiles: 2,
      dirty: true,
      isRepository: true,
    },
    selectTab: vi.fn(),
    refreshCurrent: vi.fn(),
  }),
}));

vi.mock("../thread-workbench/WorkbenchPanels", () => ({
  WorkbenchPanels: () =>
    createElement("div", {
      className: "thread-workbench-panel-stub",
    }),
}));

vi.mock("./PanelResizeHandle", () => ({
  PanelResizeHandle: () =>
    createElement("div", {
      className: "thread-workbench-resizer-stub",
    }),
}));

describe("ThreadWorkbenchRail", () => {
  it("renders one compact context row while preserving the tablist contract", () => {
    const markup = renderToStaticMarkup(
      <ThreadWorkbenchRail
        active
        onInsertContext={vi.fn()}
        onOpenFullView={vi.fn()}
        onRequestClose={vi.fn()}
        sessionId="session-1"
        workspacePath="/work/doolittle"
      />,
    );

    expect(markup).toContain('data-thread-workbench="context"');
    expect(markup).toContain('data-thread-workbench="status"');
    expect(markup).toContain("main · 12345678");
    expect(markup).toContain("Worktree · /work/doolittle");
    expect(markup).toContain("2 changed");
    expect(markup).toContain("7 tabs");
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-controls="thread-workbench-brief-panel"');
    expect(markup).not.toContain("thread-workbench-status-strip");
  });
});
