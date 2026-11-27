import { ContextActionMenu } from "@doolittle/ui";
import {
  ChevronDown,
  FolderOpen,
  GitBranch,
  Maximize2,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Terminal,
} from "lucide-react";
import { PanelTabs } from "../components/PanelTabs";
import { UiIcon } from "../components/UiIcon";
import { copyContextText } from "../context-menu-clipboard";
import { workspaceName } from "../desktop-navigation";
import { ErrorBlock } from "../lib";
import { formatShortcutLabel } from "../shortcut-label";
import {
  CODING_GLOBAL_NOTICE_CLASS,
  CODING_LAYOUT_BUTTON_CLASS,
  CODING_REPO_HEADER_CLASS,
} from "./layout";
import type { RepositorySummary } from "./models";
import "./coding-workspace-shell.css";

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
  terminalOpen,
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
  onOpenTerminal,
  onToggleZen,
  onRetrySummary,
  onSurfaceChange,
}: {
  active: boolean;
  explorerVisible: boolean;
  surface: CodeSurface;
  utilityVisible: boolean;
  terminalOpen: boolean;
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
  onOpenTerminal: () => void;
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
  const explorerShortcut = formatShortcutLabel({ key: "b", mod: true });
  const utilityShortcut = formatShortcutLabel({ key: "j", mod: true });
  const zenShortcut = formatShortcutLabel({ key: "z", mod: true, shift: true });
  const tools = [
    {
      pane: "explorer",
      label: "Explorer",
      hint: `Toggle explorer (${explorerShortcut})`,
      icon: PanelLeft,
      pressed: explorerVisible,
      onClick: onToggleExplorer,
    },
    {
      pane: "utility",
      label: "Tools",
      hint: `Toggle utility rail (${utilityShortcut})`,
      icon: PanelRight,
      pressed: utilityVisible,
      onClick: onToggleUtility,
    },
    {
      pane: undefined,
      label: "Focus mode",
      hint: `Toggle focus mode (${zenShortcut})`,
      icon: Maximize2,
      pressed: zenMode,
      onClick: onToggleZen,
    },
  ].filter((tool) => surface === "workspace" || !tool.pane);
  return (
    <>
      <header className={CODING_REPO_HEADER_CLASS}>
        <h1 className="sr-only">{path ? workspaceName(path) : "Workspace"}</h1>
        <div className="ide-workspace-bar">
          <div className="ide-workspace-identity">
            <button
              aria-label="Change repository"
              className="ide-repository-picker"
              disabled={!active}
              onClick={onChangeRepository}
              title={path || "Choose a workspace folder"}
              type="button"
            >
              <UiIcon icon={FolderOpen} />
              <span>{path ? workspaceName(path) : "Workspace"}</span>
              <UiIcon icon={ChevronDown} size="xs" />
            </button>
            <div className="ide-repository-status">
              {repositoryReady ? (
                <span
                  title={[summary.branch, divergence, summary.head]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <UiIcon icon={GitBranch} size="xs" />
                  <span className="truncate">
                    {summary.branch ?? "Detached HEAD"}
                  </span>
                  {summary.dirty ? (
                    <span
                      className="ide-repository-changes"
                      title={`${summary.changedFiles} changed files`}
                    >
                      {summary.changedFiles}
                    </span>
                  ) : null}
                </span>
              ) : summaryLoading ? (
                <span role="status">Loading repository…</span>
              ) : hasSummary && !hasRepository && !summaryError ? (
                <span>Local folder</span>
              ) : null}
            </div>
          </div>

          <PanelTabs
            id="code-surface"
            label="Workspace views"
            items={SURFACES}
            selected={surface}
            onSelect={onSurfaceChange}
          />

          <fieldset className="ide-workspace-controls">
            <legend className="sr-only">Workspace controls</legend>
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
                <UiIcon icon={tool.icon} />
              </button>
            ))}
            <button
              aria-label="Terminal"
              aria-expanded={terminalOpen}
              className={CODING_LAYOUT_BUTTON_CLASS}
              disabled={!active}
              onClick={onOpenTerminal}
              title={terminalOpen ? "Focus terminal" : "Open terminal"}
              type="button"
            >
              <UiIcon icon={Terminal} />
            </button>
            <ContextActionMenu
              label="Code workspace"
              scopeKey={path}
              items={[
                {
                  id: "refresh",
                  label: "Refresh workspace",
                  disabled: !active,
                  onSelect: onRefresh,
                },
                {
                  id: "change-repository",
                  label: "Change repository",
                  disabled: !active,
                  onSelect: onChangeRepository,
                },
                {
                  id: "copy-path",
                  label: "Copy workspace path",
                  separatorBefore: true,
                  disabled: !path,
                  onSelect: () => void copyContextText(path),
                },
                {
                  id: "copy-branch",
                  label: "Copy branch name",
                  disabled: !repositoryReady || !summary.branch,
                  onSelect: () => void copyContextText(summary.branch ?? ""),
                },
              ]}
              trigger={
                <button
                  aria-label="Workspace actions"
                  className={CODING_LAYOUT_BUTTON_CLASS}
                  title="Workspace actions"
                  type="button"
                >
                  <UiIcon icon={MoreHorizontal} />
                </button>
              }
            >
              {null}
            </ContextActionMenu>
          </fieldset>
        </div>
      </header>

      {summaryError ? (
        <div className={CODING_GLOBAL_NOTICE_CLASS}>
          <ErrorBlock error={summaryError} retry={onRetrySummary} />
        </div>
      ) : null}
    </>
  );
}
