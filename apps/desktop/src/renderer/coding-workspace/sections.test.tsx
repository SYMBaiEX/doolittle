import { Files } from "lucide-react";
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { codeWorkspaceWidthBudget } from "../workspace-layout-state";
import { CodingWorkspaceExplorer } from "./CodingWorkspaceExplorer";
import { CodingWorkspaceHeader } from "./CodingWorkspaceHeader";
import { CodingWorkspaceUtility } from "./CodingWorkspaceUtility";
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

function renderHeader(
  overrides: Partial<ComponentProps<typeof CodingWorkspaceHeader>> = {},
) {
  return renderToStaticMarkup(
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
      ...overrides,
    }),
  );
}

describe("coding workspace presentational sections", () => {
  it("forwards displayed widths and available bounds to both existing keyboard/pointer handles", () => {
    const fitted = codeWorkspaceWidthBudget(1056, {
      explorerVisible: true,
      utilityVisible: true,
      explorerWidth: 520,
      utilityWidth: 640,
    });
    const resource = { data: null, loading: false, error: "", reload: vi.fn() };
    const explorer = renderToStaticMarkup(
      createElement(CodingWorkspaceExplorer, {
        changes: [],
        changesResource: resource,
        leftPane: "files",
        onLeftPaneChange: vi.fn(),
        onOpenPath: vi.fn(),
        onResize: vi.fn(),
        onSearchDraftChange: vi.fn(),
        onSubmitSearch: vi.fn(),
        searchDraft: "",
        searchQuery: "",
        searchResource: resource,
        searchResults: [],
        selectedPath: "",
        treeEntries: [],
        treeResource: resource,
        width: fitted.explorerWidth,
        resizeBounds: fitted.explorerBounds,
      }),
    );
    const utility = renderToStaticMarkup(
      createElement(CodingWorkspaceUtility, {
        active: true,
        branchesResource: resource,
        changes: [],
        commits: [],
        conflictsResource: resource,
        logResource: resource,
        onChooseWorkspace: vi.fn(),
        onOpenWorkspacePath: vi.fn(),
        onOpenTerminal: vi.fn(),
        onRefresh: vi.fn(),
        onResize: vi.fn(),
        onUtilityPaneChange: vi.fn(),
        remotesResource: resource,
        stashesResource: resource,
        summary,
        utilityPane: "terminal",
        worktreeResource: resource,
        width: fitted.utilityWidth,
        resizeBounds: fitted.utilityBounds,
      }),
    );
    expect(explorer).toMatch(
      /aria-label="Resize code explorer"[^>]*aria-valuemax="326"[^>]*aria-valuemin="210"[^>]*aria-valuenow="326"/u,
    );
    expect(utility).toMatch(
      /aria-label="Resize code utility panel"[^>]*aria-valuemax="410"[^>]*aria-valuemin="270"[^>]*aria-valuenow="410"/u,
    );
    for (const markup of [explorer, utility]) {
      const ids = [...markup.matchAll(/\sid="([^"]+)"/gu)].map(
        (match) => match[1],
      );
      expect(new Set(ids).size).toBe(ids.length);
      expect(markup).toMatch(/aria-controls="coding-[^"]+-container"/u);
    }
    expect(explorer).toContain('tabindex="0"');
    expect(utility).toContain('tabindex="0"');
  });

  it.each([
    {
      state: "verified dirty repository",
      overrides: {},
      label: "Changes",
      tone: "warn",
      metrics: ["3", "1", "2"],
    },
    {
      state: "verified clean repository",
      overrides: {
        summary: { ...summary, dirty: false, changedFiles: 0 },
      },
      label: "Clean",
      tone: "good",
      metrics: ["0", "1", "2"],
    },
    {
      state: "loaded non-Git workspace",
      overrides: { summary: { ...summary, isRepository: false } },
      label: "No Git repository",
      tone: "neutral",
      metrics: ["—", "—", "—"],
    },
    {
      state: "missing summary",
      overrides: { hasSummary: false },
      label: "Unavailable",
      tone: "neutral",
      metrics: ["—", "—", "—"],
    },
    {
      state: "initial summary load",
      overrides: { hasSummary: false, summaryLoading: true },
      label: "Syncing",
      tone: "neutral",
      metrics: ["—", "—", "—"],
    },
    {
      state: "refresh of a dirty repository",
      overrides: { summaryLoading: true },
      label: "Syncing",
      tone: "neutral",
      metrics: ["—", "—", "—"],
    },
    {
      state: "failed refresh with stale dirty data",
      overrides: { summaryError: "Repository status unavailable" },
      label: "Unavailable",
      tone: "bad",
      metrics: ["—", "—", "—"],
    },
  ])(
    "projects $state without inventing Git state",
    ({ overrides, label, tone, metrics }) => {
      const markup = renderHeader(overrides);
      const hasRepository =
        (overrides.hasSummary ?? true) &&
        (overrides.summary ?? summary).isRepository;
      if (hasRepository) {
        expect(markup).toContain("<h1>main</h1>");
        expect(markup).toContain("<code>abc123</code>");
      } else {
        expect(markup).toContain("<h1>Workspace</h1>");
        expect(markup).not.toContain("<h1>main</h1>");
        expect(markup).not.toContain("<code>abc123</code>");
      }
      expect(markup).toMatch(
        new RegExp(`class="[^"]*badge ${tone}[^"]*"[^>]*>${label}</div>`, "u"),
      );
      expect(
        markup.match(/<strong class="coding-repo-state-value\b/gu),
      ).toHaveLength(metrics.length);
      expect(
        Array.from(
          markup.matchAll(
            /<strong class="coding-repo-state-value[^"]*">(?:<svg\b[^>]*>[\s\S]*?<\/svg>)?([0-9]+|—)<\/strong> (changed|ahead|behind)<\/span>/gu,
          ),
          ([, value, metric]) => [metric, value],
        ),
      ).toEqual([
        ["changed", metrics[0]],
        ["ahead", metrics[1]],
        ["behind", metrics[2]],
      ]);
      expect(markup).toContain(">Refresh</button>");
      expect(markup).toContain('aria-label="Workspace layout"');
      if (label !== "Clean") expect(markup).not.toContain(">Clean</div>");
      if (label === "No Git repository") {
        expect(markup).toContain(
          "This workspace is not inside a Git repository.",
        );
        expect(markup).not.toContain(">Changes</div>");
      }
    },
  );

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
