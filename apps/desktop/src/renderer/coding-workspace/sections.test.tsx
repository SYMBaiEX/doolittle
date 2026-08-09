import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CodingWorkspaceHeader } from "./CodingWorkspaceHeader";
import { PaneTabs } from "./PaneTabs";

const summary = {
  isRepository: true,
  branch: "main",
  head: "abc123",
  root: "/work/doolittle",
  ahead: 1,
  behind: 2,
  dirty: true,
  changedFiles: 3,
};

describe("coding workspace presentational sections", () => {
  it("keeps repository status and layout controls accessible", () => {
    const markup = renderToStaticMarkup(
      createElement(CodingWorkspaceHeader, {
        active: true,
        explorerVisible: true,
        hasSummary: true,
        onRefresh: vi.fn(),
        onRetrySummary: vi.fn(),
        onToggleExplorer: vi.fn(),
        onToggleUtility: vi.fn(),
        onToggleZen: vi.fn(),
        summary,
        summaryError: "",
        summaryLoading: false,
        utilityVisible: true,
        zenMode: false,
      }),
    );

    expect(markup).toContain('aria-label="Repository status"');
    expect(markup).toContain("main");
    expect(markup).toContain('aria-label="Workspace layout"');
    expect(markup).toContain('title="Toggle focus mode (⌘/Ctrl Shift Z)"');
  });

  it("renders tab semantics, counts, and roving tab indexes", () => {
    const markup = renderToStaticMarkup(
      createElement(PaneTabs, {
        label: "Explorer views",
        onChange: vi.fn(),
        options: [
          { id: "files", label: "Files" },
          { id: "changes", label: "Changes", count: 2 },
        ],
        value: "changes",
      }),
    );

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain("Changes<span>2</span>");
  });
});
