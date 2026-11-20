import { ContextActionMenu } from "@doolittle/ui";
import {
  FolderOpen,
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
import {
  CODING_GLOBAL_NOTICE_CLASS,
  CODING_LAYOUT_BUTTON_CLASS,
  CODING_REPO_HEADER_CLASS,
  CODING_REPO_STATE_CLASS,
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
  workspacePath,
  onChangeRepository,
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
  workspacePath: string;
  onChangeRepository: () => void;
  onRefresh: () => void;
  onToggleExplorer: () => void;
  onToggleUtility: () => void;
  onToggleZen: () => void;
  onRetrySummary: () => void;
  onSurfaceChange: (surface: CodeSurface) => void;
}) {
  const hasRepository = hasSummary && summary.isRepository;
  const repositoryReady = hasRepository && !summaryLoading && !summaryError;
  const path = summary.root ?? workspacePath;
  const divergence = [
    summary.ahead ? `${summary.ahead} ahead` : null,
    summary.behind ? `${summary.behind} behind` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const tools = [
    {
      pane: "explorer",
      label: "Explorer",
      hint: "Toggle explorer (⌘/Ctrl B)",
      icon: PanelLeft,
      pressed: explorerVisible,
      onClick: onToggleExplorer,
    },
    {
      pane: "utility",
      label: "Tools",
      hint: "Toggle utility rail (⌘/Ctrl J)",
      icon: PanelRight,
      pressed: utilityVisible,
      onClick: onToggleUtility,
    },
    {
      pane: undefined,
      label: "Focus mode",
      hint: "Toggle focus mode (⌘/Ctrl Shift Z)",
      icon: Maximize2,
      pressed: zenMode,
      onClick: onToggleZen,
    },
  ].filter((tool) => surface === "workspace" || !tool.pane);
  return (
    <>
      <ContextActionMenu
        label="Code workspace"
        scopeKey={summary.root ?? ""}
        items={[
          {
            id: "change-repository",
            label: "Change repository",
            disabled: !active,
            onSelect: onChangeRepository,
          },
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
            disabled: surface !== "workspace",
            shortcut: "⌘/Ctrl B",
            onSelect: onToggleExplorer,
          },
          {
            id: "utility",
            label: utilityVisible ? "Hide utility rail" : "Show utility rail",
            disabled: surface !== "workspace",
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
          <h1 className="sr-only">
            {path ? workspaceName(path) : "Workspace"}
          </h1>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 px-1">
            <PanelTabs
              id="code-surface"
              label="Workspace views"
              items={SURFACES}
              selected={surface}
              onSelect={onSurfaceChange}
            />
            <div
              className={`${CODING_REPO_STATE_CLASS} shrink min-w-0 justify-center px-1.5 max-[720px]:hidden`}
            >
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
            <fieldset className="m-0 ml-auto flex min-w-0 shrink-0 items-center gap-1 border-0 px-1 py-0">
              <legend className="sr-only">Workspace controls</legend>
              <button
                aria-label="Change repository"
                className="secondary-button inline-flex min-h-9 shrink-0 items-center gap-1.5 px-2 text-xs max-[760px]:min-h-11 max-[760px]:min-w-11"
                disabled={!active}
                onClick={onChangeRepository}
                title="Open a new chat and IDE in another folder"
                type="button"
              >
                <UiIcon icon={FolderOpen} size="sm" />
                <span className="max-[760px]:sr-only">Change repository</span>
              </button>
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
                  data-code-pane-toggle={tool.pane}
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
