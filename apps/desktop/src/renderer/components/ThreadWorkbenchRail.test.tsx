// @vitest-environment jsdom
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
    preview: { data: null, error: "", loading: false, reload: vi.fn() },
    plans: { data: null, error: "", loading: false, reload: vi.fn() },
    delegationTasks: { data: null, error: "", loading: false, reload: vi.fn() },
    codegen: { data: null, error: "", loading: false, reload: vi.fn() },
    approvals: { data: null, error: "", loading: false, reload: vi.fn() },
    terminal: { data: null, error: "", loading: false, reload: vi.fn() },
    briefPlanSummary: { activePlan: null, draftCount: 0 },
    approvalEntries: [],
    changeEntries: [],
    commandEntries: [],
    delegatedTaskEntries: [],
    fileEntries: [],
    planEntries: [],
    settingEntries: [],
    runEntries: [],
    activeRunCount: 0,
    failedRunCount: 0,
    insert: vi.fn(),
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
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="Brief"');
    expect(markup).toContain('class="sr-only">Brief</small>');
    expect(markup).toMatch(
      /aria-controls="thread-workbench-[\w-]+-brief-panel"/,
    );
    expect(markup).not.toContain("thread-workbench-status-strip");
  });

  it("keeps tab and panel relationships unique and local across independent rails", () => {
    const sessions = [
      { key: "a", sessionId: "private/session [A]" },
      { key: "b", sessionId: "private/session [B]" },
      { key: "empty-a", sessionId: "" },
      { key: "empty-b", sessionId: "" },
    ];
    const markup = renderToStaticMarkup(
      sessions.map(({ key, sessionId }) => (
        <ThreadWorkbenchRail
          active
          key={key}
          onInsertContext={vi.fn()}
          onOpenFullView={vi.fn()}
          onRequestClose={vi.fn()}
          sessionId={sessionId}
          workspacePath="/work/doolittle"
        />
      )),
    );
    const document = new DOMParser().parseFromString(markup, "text/html");
    const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^thread-workbench-[\w-]+$/.test(id))).toBe(true);
    expect(markup).not.toContain("private/session");
    const rails = [
      ...document.querySelectorAll('[data-thread-workbench="rail"]'),
    ];
    expect(rails).toHaveLength(4);
    for (const rail of rails) {
      const tabs = [...rail.querySelectorAll('[role="tab"]')];
      expect(tabs).toHaveLength(7);
      const selected = rail.querySelector('[role="tab"][aria-selected="true"]');
      const panel = rail.querySelector('[role="tabpanel"]');
      expect(selected).not.toBeNull();
      expect(panel).not.toBeNull();
      expect(selected?.getAttribute("aria-controls")).toBe(panel?.id);
      expect(panel?.getAttribute("aria-labelledby")).toBe(selected?.id);
      expect(
        document.getElementById(selected?.getAttribute("aria-controls") ?? ""),
      ).toBe(panel);
      for (const tab of tabs) {
        expect(tab.getAttribute("aria-controls")).toBe(
          tab.id.replace(/-tab$/, "-panel"),
        );
        expect(tab.getAttribute("tabindex")).toBe(
          tab === selected ? "0" : "-1",
        );
      }
    }
  });
});
