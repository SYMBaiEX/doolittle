import { ContextActionMenu } from "@doolittle/ui";
import { ArrowDown, ArrowUp } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import { copyContextText } from "../context-menu-clipboard";
import { Badge, ErrorBlock } from "../lib";
import { compactWorkspacePath } from "../workspace-path";
import {
  CODING_GLOBAL_NOTICE_CLASS,
  CODING_INLINE_STATE_CLASS,
  CODING_LAYOUT_BUTTON_CLASS,
  CODING_LAYOUT_BUTTON_SELECTED_CLASS,
  CODING_LAYOUT_CONTROLS_CLASS,
  CODING_REPO_HEADER_CLASS,
  CODING_REPO_IDENTITY_CLASS,
  CODING_REPO_MARK_CLASS,
  CODING_REPO_PATH_CLASS,
  CODING_REPO_STATE_CLASS,
  CODING_REPO_STATE_VALUE_CLASS,
  CODING_REPO_TITLE_CLASS,
} from "./layout";
import type { RepositorySummary } from "./models";

export type CodeSurface = "workspace" | "preview";

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
          <div className={CODING_REPO_IDENTITY_CLASS}>
            <div className={CODING_REPO_MARK_CLASS} aria-hidden="true">
              &gt;_
            </div>
            <div>
              <span className="eyebrow">Workspace</span>
              <div className={CODING_REPO_TITLE_CLASS}>
                <h1>{(hasRepository && summary.branch) || "Workspace"}</h1>
                {hasRepository && summary.head ? (
                  <code>{summary.head}</code>
                ) : null}
                {summaryLoading ? (
                  <Badge>Syncing</Badge>
                ) : summaryError || !hasSummary ? (
                  <Badge tone={summaryError ? "bad" : "neutral"}>
                    Unavailable
                  </Badge>
                ) : !summary.isRepository ? (
                  <Badge>No Git repository</Badge>
                ) : (
                  <Badge tone={summary.dirty ? "warn" : "good"}>
                    {summary.dirty ? "Changes" : "Clean"}
                  </Badge>
                )}
              </div>
              <p className={CODING_REPO_PATH_CLASS} title={summary.root}>
                {compactWorkspacePath(summary.root ?? "Local workspace")}
              </p>
            </div>
          </div>
          <div
            className={CODING_REPO_STATE_CLASS}
            aria-label="Repository status"
            role="status"
          >
            <span>
              <strong className={CODING_REPO_STATE_VALUE_CLASS}>
                {repositoryReady ? summary.changedFiles : "—"}
              </strong>{" "}
              changed
            </span>
            <span>
              <strong className={CODING_REPO_STATE_VALUE_CLASS}>
                <UiIcon icon={ArrowUp} size="xs" />
                {repositoryReady ? summary.ahead : "—"}
              </strong>{" "}
              ahead
            </span>
            <span>
              <strong className={CODING_REPO_STATE_VALUE_CLASS}>
                <UiIcon icon={ArrowDown} size="xs" />
                {repositoryReady ? summary.behind : "—"}
              </strong>{" "}
              behind
            </span>
            <button
              className="secondary-button"
              disabled={!active}
              onClick={onRefresh}
              type="button"
            >
              Refresh
            </button>
            <div
              aria-label="Workspace layout"
              className={CODING_LAYOUT_CONTROLS_CLASS}
              role="toolbar"
            >
              <div
                aria-label="Code surface"
                className={CODING_LAYOUT_CONTROLS_CLASS}
                role="toolbar"
              >
                <button
                  aria-pressed={surface === "workspace"}
                  className={`${CODING_LAYOUT_BUTTON_CLASS} ${surface === "workspace" ? CODING_LAYOUT_BUTTON_SELECTED_CLASS : ""}`}
                  onClick={() => onSurfaceChange("workspace")}
                  type="button"
                >
                  Code
                </button>
                <button
                  aria-pressed={surface === "preview"}
                  className={`${CODING_LAYOUT_BUTTON_CLASS} ${surface === "preview" ? CODING_LAYOUT_BUTTON_SELECTED_CLASS : ""}`}
                  onClick={() => onSurfaceChange("preview")}
                  type="button"
                >
                  Preview
                </button>
              </div>
              <button
                aria-pressed={explorerVisible}
                className={`${CODING_LAYOUT_BUTTON_CLASS} ${explorerVisible ? CODING_LAYOUT_BUTTON_SELECTED_CLASS : ""}`}
                onClick={onToggleExplorer}
                title="Toggle explorer (⌘/Ctrl B)"
                type="button"
              >
                Explorer
              </button>
              <button
                aria-pressed={utilityVisible}
                className={`${CODING_LAYOUT_BUTTON_CLASS} ${utilityVisible ? CODING_LAYOUT_BUTTON_SELECTED_CLASS : ""}`}
                onClick={onToggleUtility}
                title="Toggle utility rail (⌘/Ctrl J)"
                type="button"
              >
                Utility
              </button>
              <button
                aria-pressed={zenMode}
                className={`${CODING_LAYOUT_BUTTON_CLASS} ${zenMode ? CODING_LAYOUT_BUTTON_SELECTED_CLASS : ""}`}
                onClick={onToggleZen}
                title="Toggle focus mode (⌘/Ctrl Shift Z)"
                type="button"
              >
                Focus
              </button>
            </div>
          </div>
        </header>
      </ContextActionMenu>

      {summaryError ? (
        <div className={CODING_GLOBAL_NOTICE_CLASS}>
          <ErrorBlock error={summaryError} retry={onRetrySummary} />
        </div>
      ) : null}
      {!summaryLoading && hasSummary && !summary.isRepository ? (
        <div className={CODING_GLOBAL_NOTICE_CLASS}>
          <div className={CODING_INLINE_STATE_CLASS}>
            This workspace is not inside a Git repository. Files remain
            available, while changes, commits, and worktrees will be empty.
          </div>
        </div>
      ) : null}
    </>
  );
}
