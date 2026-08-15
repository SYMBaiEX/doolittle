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

export function CodingWorkspaceHeader({
  active,
  explorerVisible,
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
}: {
  active: boolean;
  explorerVisible: boolean;
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
}) {
  return (
    <>
      <header className={CODING_REPO_HEADER_CLASS}>
        <div className={CODING_REPO_IDENTITY_CLASS}>
          <div className={CODING_REPO_MARK_CLASS} aria-hidden="true">
            &gt;_
          </div>
          <div>
            <span className="eyebrow">Agentic workspace</span>
            <div className={CODING_REPO_TITLE_CLASS}>
              <h1>{summary.branch || "Workspace"}</h1>
              {summary.head ? <code>{summary.head}</code> : null}
              {summaryLoading ? (
                <Badge>Syncing</Badge>
              ) : summaryError ? (
                <Badge tone="bad">Unavailable</Badge>
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
              {summaryLoading ? "—" : summary.changedFiles}
            </strong>{" "}
            changed
          </span>
          <span>
            <strong className={CODING_REPO_STATE_VALUE_CLASS}>
              ↑ {summaryLoading ? "—" : summary.ahead}
            </strong>{" "}
            ahead
          </span>
          <span>
            <strong className={CODING_REPO_STATE_VALUE_CLASS}>
              ↓ {summaryLoading ? "—" : summary.behind}
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
