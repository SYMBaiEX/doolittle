import { Files } from "lucide-react";
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
        onSurfaceChange: vi.fn(),
        onToggleExplorer: vi.fn(),
        onToggleUtility: vi.fn(),
        onToggleZen: vi.fn(),
        summary,
        summaryError: "",
        summaryLoading: false,
        surface: "workspace",
        utilityVisible: true,
        zenMode: false,
      }),
    );

    expect(markup).toContain('aria-label="Repository status"');
    expect(markup).toContain("main");
    expect(markup).toContain('aria-label="Workspace layout"');
    expect(markup).toContain('aria-label="Code surface"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain(">Code<");
    expect(markup).toContain(">Preview<");
    expect(markup).toContain('title="Toggle focus mode (⌘/Ctrl Shift Z)"');
  });

  it("marks Preview as the selected contextual surface", () => {
    const markup = renderToStaticMarkup(
      createElement(CodingWorkspaceHeader, {
        active: true,
        explorerVisible: true,
        hasSummary: true,
        onRefresh: vi.fn(),
        onRetrySummary: vi.fn(),
        onSurfaceChange: vi.fn(),
        onToggleExplorer: vi.fn(),
        onToggleUtility: vi.fn(),
        onToggleZen: vi.fn(),
        summary,
        summaryError: "",
        summaryLoading: false,
        surface: "preview",
        utilityVisible: true,
        zenMode: false,
      }),
    );

    expect(markup).toMatch(/aria-pressed="false"[^>]*>Code<\/button>/u);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Preview<\/button>/u);
  });

  it("renders tab semantics, counts, and roving tab indexes", () => {
    const markup = renderToStaticMarkup(
      createElement(PaneTabs, {
        label: "Explorer views",
        onChange: vi.fn(),
        options: [
          { id: "files", label: "Files", icon: Files },
          { id: "changes", label: "Changes", count: 2 },
        ],
        panelId: "coding-explorer-panel",
        value: "changes",
      }),
    );

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-controls="coding-explorer-panel"');
    expect(markup).toContain('id="coding-explorer-panel-tab-changes"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('class="coding-tab-label">Changes</span>');
    expect(markup).toContain('class="coding-tab-count">2</span>');
    expect(markup).toContain('aria-hidden="true"');
  });
});
