import { Badge, ErrorBlock } from "../lib";
import { compactWorkspacePath } from "../workspace-path";
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
      <header className="coding-repo-header">
        <div className="coding-repo-identity">
          <div className="coding-repo-mark" aria-hidden="true">
            &gt;_
          </div>
          <div>
            <span className="eyebrow">Agentic workspace</span>
            <div className="coding-repo-title">
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
            <p title={summary.root}>
              {compactWorkspacePath(summary.root ?? "Local workspace")}
            </p>
          </div>
        </div>
        <div
          className="coding-repo-state"
          aria-label="Repository status"
          role="status"
        >
          <span>
            <strong className="coding-repo-state-value">
              {summaryLoading ? "—" : summary.changedFiles}
            </strong>{" "}
            changed
          </span>
          <span>
            <strong className="coding-repo-state-value">
              ↑ {summaryLoading ? "—" : summary.ahead}
            </strong>{" "}
            ahead
          </span>
          <span>
            <strong className="coding-repo-state-value">
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
            className="coding-layout-controls"
            role="toolbar"
          >
            <button
              aria-pressed={explorerVisible}
              className={explorerVisible ? "selected" : ""}
              onClick={onToggleExplorer}
              title="Toggle explorer (⌘/Ctrl B)"
              type="button"
            >
              Explorer
            </button>
            <button
              aria-pressed={utilityVisible}
              className={utilityVisible ? "selected" : ""}
              onClick={onToggleUtility}
              title="Toggle utility rail (⌘/Ctrl J)"
              type="button"
            >
              Utility
            </button>
            <button
              aria-pressed={zenMode}
              className={zenMode ? "selected" : ""}
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
        <div className="coding-global-notice">
          <ErrorBlock error={summaryError} retry={onRetrySummary} />
        </div>
      ) : null}
      {!summaryLoading && hasSummary && !summary.isRepository ? (
        <div className="coding-global-notice">
          <div className="coding-inline-state">
            This workspace is not inside a Git repository. Files remain
            available, while changes, commits, and worktrees will be empty.
          </div>
        </div>
      ) : null}
    </>
  );
}
