import { ContextActionMenu } from "@doolittle/ui";
import {
  GitBranch,
  Maximize2,
  PanelLeft,
  PanelRight,
  RefreshCw,
} from "lucide-react";
import { PanelTabs } from "../components/PanelTabs";
import { UiIcon } from "../components/UiIcon";
import { copyContextText } from "../context-menu-clipboard";
import { workspaceName } from "../desktop-navigation";
import { Badge, ErrorBlock } from "../lib";
import { compactWorkspacePath } from "../workspace-path";
import {
  CODING_GLOBAL_NOTICE_CLASS,
  CODING_LAYOUT_BUTTON_CLASS,
  CODING_REPO_HEADER_CLASS,
  CODING_REPO_IDENTITY_CLASS,
  CODING_REPO_PATH_CLASS,
  CODING_REPO_STATE_CLASS,
  CODING_REPO_TITLE_CLASS,
} from "./layout";
import type { RepositorySummary } from "./models";

export type CodeSurface = "workspace" | "preview";
const SURFACES = [
  { id: "workspace", label: "Editor", panelId: "coding-workspace-surface" },
  { id: "preview", label: "Preview", panelId: "coding-preview-surface" },
] as const;

export function CodingWorkspaceHeader({
  active,
  explorerVisible,
  surface,
  utilityVisible,
  zenMode,
  summary,
  hasSummary,
  summaryLoading,
  summaryError,
  onRefresh,
  onToggleExplorer,
  onToggleUtility,
  onToggleZen,
  onRetrySummary,
  onSurfaceChange,
}: {
  active: boolean;
  explorerVisible: boolean;
  surface: CodeSurface;
  utilityVisible: boolean;
  zenMode: boolean;
  summary: RepositorySummary;
  hasSummary: boolean;
  summaryLoading: boolean;
  summaryError: string;
  onRefresh: () => void;
  onToggleExplorer: () => void;
  onToggleUtility: () => void;
  onToggleZen: () => void;
  onRetrySummary: () => void;
  onSurfaceChange: (surface: CodeSurface) => void;
}) {
  const hasRepository = hasSummary && summary.isRepository;
  const repositoryReady = hasRepository && !summaryLoading && !summaryError;
  const path = summary.root ?? "Local workspace";
  const divergence = [
    summary.ahead ? `${summary.ahead} ahead` : null,
    summary.behind ? `${summary.behind} behind` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const tools = [
    {
      label: "Explorer",
      hint: "Toggle explorer (⌘/Ctrl B)",
      icon: PanelLeft,
      pressed: explorerVisible,
      onClick: onToggleExplorer,
    },
    {
      label: "Tools",
      hint: "Toggle utility rail (⌘/Ctrl J)",
      icon: PanelRight,
      pressed: utilityVisible,
      onClick: onToggleUtility,
    },
    {
      label: "Focus mode",
      hint: "Toggle focus mode (⌘/Ctrl Shift Z)",
      icon: Maximize2,
      pressed: zenMode,
      onClick: onToggleZen,
    },
  ];
  return (
    <>
      <ContextActionMenu
        label="Code workspace"
        scopeKey={summary.root ?? ""}
        items={[
          {
            id: "refresh",
            label: "Refresh workspace",
            disabled: !active,
            onSelect: onRefresh,
          },
          {
            id: "code",
            label: "Show code",
            separatorBefore: true,
            onSelect: () => onSurfaceChange("workspace"),
          },
          {
            id: "preview",
            label: "Show preview",
            onSelect: () => onSurfaceChange("preview"),
          },
          {
            id: "explorer",
            label: explorerVisible ? "Hide explorer" : "Show explorer",
            shortcut: "⌘/Ctrl B",
            onSelect: onToggleExplorer,
          },
          {
            id: "utility",
            label: utilityVisible ? "Hide utility rail" : "Show utility rail",
            shortcut: "⌘/Ctrl J",
            onSelect: onToggleUtility,
          },
          {
            id: "focus",
            label: zenMode ? "Leave focus mode" : "Enter focus mode",
            shortcut: "⌘/Ctrl Shift Z",
            onSelect: onToggleZen,
          },
          {
            id: "copy-path",
            label: "Copy workspace path",
            separatorBefore: true,
            disabled: !summary.root,
            onSelect: () => copyContextText(summary.root ?? ""),
          },
          {
            id: "copy-branch",
            label: "Copy branch name",
            disabled: !repositoryReady || !summary.branch,
            onSelect: () => copyContextText(summary.branch ?? ""),
          },
        ]}
      >
        <header className={CODING_REPO_HEADER_CLASS}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 pt-2">
            <div className={CODING_REPO_IDENTITY_CLASS}>
              <h1 className={CODING_REPO_TITLE_CLASS}>
                {summary.root ? workspaceName(path) : "Workspace"}
              </h1>
              <p className={CODING_REPO_PATH_CLASS} title={path}>
                {compactWorkspacePath(path)}
              </p>
            </div>
            <div className={CODING_REPO_STATE_CLASS}>
              {repositoryReady ? (
                <>
                  <span
                    className="inline-flex min-w-0 items-center gap-1.5"
                    title={summary.head}
                  >
                    <UiIcon icon={GitBranch} size="xs" />
                    <span className="truncate font-mono">
                      {summary.branch ?? "Detached HEAD"}
                    </span>
                  </span>
                  <Badge tone={summary.dirty ? "warn" : "good"}>
                    {summary.dirty
                      ? `${summary.changedFiles} changed`
                      : "Clean"}
                  </Badge>
                  {divergence ? <span>{divergence}</span> : null}
                </>
              ) : summaryLoading ? (
                <span role="status">Syncing workspace…</span>
              ) : hasSummary && !summary.isRepository && !summaryError ? (
                <Badge>No Git repository</Badge>
              ) : null}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 px-1">
            <PanelTabs
              id="code-surface"
              label="Workspace views"
              items={SURFACES}
              selected={surface}
              onSelect={onSurfaceChange}
            />
            <fieldset className="m-0 flex min-w-0 shrink-0 items-center gap-1 border-0 px-1 py-0">
              <legend className="sr-only">Workspace controls</legend>
              <button
                aria-label="Refresh workspace"
                className={CODING_LAYOUT_BUTTON_CLASS}
                disabled={!active}
                onClick={onRefresh}
                title="Refresh workspace"
                type="button"
              >
                <UiIcon icon={RefreshCw} size="sm" />
              </button>
              {tools.map((tool) => (
                <button
                  aria-label={tool.label}
                  aria-pressed={tool.pressed}
                  className={CODING_LAYOUT_BUTTON_CLASS}
                  key={tool.label}
                  onClick={tool.onClick}
                  title={tool.hint}
                  type="button"
                >
                  <UiIcon icon={tool.icon} size="sm" />
                </button>
              ))}
            </fieldset>
          </div>
        </header>
      </ContextActionMenu>

      {summaryError ? (
        <div className={CODING_GLOBAL_NOTICE_CLASS}>
          <ErrorBlock error={summaryError} retry={onRetrySummary} />
        </div>
      ) : null}
    </>
  );
}
