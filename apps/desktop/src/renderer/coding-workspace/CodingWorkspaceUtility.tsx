import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import {
  ChevronRight,
  Copy,
  GitBranch,
  GitCommit,
  GitFork,
  RefreshCw,
  SquareTerminal,
} from "lucide-react";
import { type ReactNode, useId } from "react";
import type { WorkspacePickResult } from "../../shared/contracts";
import { ExecutionEnvironmentPanel } from "../components/ExecutionEnvironmentPanel";
import {
  GitControlPanel,
  type GitControlPanelProps,
} from "../components/GitControlPanel";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { UiIcon } from "../components/UiIcon";
import type { ComputerOrigin } from "../computer-origin";
import { copyContextText } from "../context-menu-clipboard";
import { type ApiResource, EmptyBlock, ErrorBlock, LoadingBlock } from "../lib";
import { CODE_UTILITY_WIDTH } from "../panel-layout";
import { ChangeFileList } from "../thread-workbench/ChangeFileList";
import "../thread-workbench/workspace-inspector.css";
import {
  CODING_PANE_BODY_CLASS,
  CODING_PANE_CLASS,
  CODING_PANE_OVERLAY_CLASS,
  CODING_PANE_TABS_CLASS,
  CODING_UTILITY_CLASS,
  CODING_UTILITY_RESIZER_CLASS,
} from "./layout";
import type {
  CommitRow,
  RepositoryBranchesResponse,
  RepositoryChange,
  RepositoryConflictsResponse,
  RepositoryLogResponse,
  RepositoryRemotesResponse,
  RepositoryStashesResponse,
  RepositorySummary,
  RepositoryWorktreesResponse,
  UtilityPane,
} from "./models";
import { controlChanges, records } from "./models";
import { PaneTabs, paneTabId } from "./PaneTabs";

export function CodingWorkspaceUtility({
  active,
  canCreateWorktree,
  summary,
  utilityPane,
  onUtilityPaneChange,
  width,
  dismissControl,
  resizeBounds = CODE_UTILITY_WIDTH,
  onResize,
  commits,
  changes,
  logResource,
  mutateRepository,
  origin,
  branchesResource,
  remotesResource,
  stashesResource,
  conflictsResource,
  worktreeResource,
  onRefresh,
  onChooseWorkspace,
  onOpenWorkspacePath,
  onOpenTerminal,
  selectedPath,
  onOpenDiff,
}: {
  active: boolean;
  canCreateWorktree: boolean;
  summary: RepositorySummary;
  utilityPane: UtilityPane;
  onUtilityPaneChange: (value: UtilityPane) => void;
  width: number;
  dismissControl?: ReactNode;
  resizeBounds?: { default: number; min: number; max: number };
  onResize: (value: number) => void;
  commits: CommitRow[];
  changes: RepositoryChange[];
  logResource: ApiResource<RepositoryLogResponse>;
  mutateRepository: NonNullable<GitControlPanelProps["mutate"]>;
  origin: ComputerOrigin;
  branchesResource: ApiResource<RepositoryBranchesResponse>;
  remotesResource: ApiResource<RepositoryRemotesResponse>;
  stashesResource: ApiResource<RepositoryStashesResponse>;
  conflictsResource: ApiResource<RepositoryConflictsResponse>;
  worktreeResource: ApiResource<RepositoryWorktreesResponse>;
  onRefresh: () => void;
  onChooseWorkspace: () => Promise<WorkspacePickResult>;
  onOpenWorkspacePath: (path: string) => Promise<WorkspacePickResult>;
  onOpenTerminal: () => void;
  selectedPath?: string;
  onOpenDiff: (path: string) => void;
}) {
  const panelId = `coding-utility-${useId().replace(/:/gu, "")}`;
  return (
    <aside
      aria-label="Workspace tools"
      data-code-pane="utility"
      data-overlay={Boolean(dismissControl)}
      id={`${panelId}-container`}
      className={`${CODING_PANE_CLASS} ${CODING_PANE_OVERLAY_CLASS} ${CODING_UTILITY_CLASS} workspace-inspector workspace-inspector--ide`}
    >
      {!dismissControl && (
        <PanelResizeHandle
          bounds={resizeBounds}
          className={CODING_UTILITY_RESIZER_CLASS}
          controls={`${panelId}-container`}
          direction="grow-left"
          label="Resize code utility panel"
          onResize={onResize}
          value={width}
        />
      )}
      <header className="workspace-inspector-heading">
        <div className="workspace-inspector-label">
          <h2>Workspace tools</h2>
          {summary.branch ? (
            <small
              className="workspace-inspector-branch"
              title={summary.branch}
            >
              <UiIcon icon={GitBranch} size="xs" />
              <span>{summary.branch}</span>
            </small>
          ) : null}
        </div>
        <div className="workspace-inspector-actions">
          {utilityPane !== "terminal" ? (
            <button
              aria-label="Refresh workspace tools"
              className="workspace-inspector-icon"
              onClick={onRefresh}
              title="Refresh workspace tools"
              type="button"
            >
              <UiIcon icon={RefreshCw} size="sm" />
            </button>
          ) : null}
          {dismissControl}
        </div>
      </header>
      <div className={`${CODING_PANE_TABS_CLASS} workspace-inspector-tabs`}>
        <PaneTabs<UtilityPane>
          label="Workspace utilities"
          options={[
            {
              id: "source-control",
              label: "Changes",
              count: changes.length,
              icon: GitBranch,
            },
            { id: "commits", label: "History", icon: GitCommit },
            {
              id: "worktrees",
              label: "Worktrees",
              icon: GitFork,
            },
            { id: "terminal", label: "Terminal", icon: SquareTerminal },
          ]}
          panelId={panelId}
          value={utilityPane}
          onChange={onUtilityPaneChange}
        />
      </div>
      <div
        aria-labelledby={paneTabId(panelId, utilityPane)}
        className={`${CODING_PANE_BODY_CLASS} workspace-inspector-body`}
        id={panelId}
        role="tabpanel"
      >
        {utilityPane === "terminal" ? (
          <section
            aria-label="Workspace terminal"
            className="workspace-inspector-section"
          >
            <header className="workspace-inspector-section-title">
              <h3>Shared terminal</h3>
            </header>
            <p className="workspace-inspector-empty">
              Your shell stays in the bottom dock when you switch views.
            </p>
            <button
              className="workspace-inspector-action workspace-inspector-terminal-action"
              onClick={onOpenTerminal}
              type="button"
            >
              <UiIcon icon={SquareTerminal} size="sm" />
              Focus shared terminal
            </button>
          </section>
        ) : null}

        {utilityPane === "commits" ? (
          logResource.loading ? (
            <LoadingBlock label="Reading recent commits…" />
          ) : logResource.error ? (
            <ErrorBlock error={logResource.error} retry={logResource.reload} />
          ) : commits.length ? (
            <ul
              aria-label="Recent commits"
              className="workspace-inspector-list"
            >
              {commits.map((commit) => (
                <li className="workspace-inspector-row" key={commit.id}>
                  <UiIcon icon={GitCommit} size="sm" />
                  <span className="workspace-inspector-label">
                    <strong title={commit.subject}>{commit.subject}</strong>
                    <small title={commit.hash}>{commit.hash.slice(0, 8)}</small>
                  </span>
                  <button
                    aria-label={`Copy commit ${commit.hash}`}
                    className="workspace-inspector-icon"
                    onClick={() => void copyContextText(commit.hash)}
                    title="Copy commit hash"
                    type="button"
                  >
                    <UiIcon icon={Copy} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyBlock title="No commit history">
              Recent commits will appear when this workspace has Git history.
            </EmptyBlock>
          )
        ) : null}

        {utilityPane === "source-control" ? (
          summary.isRepository ? (
            <>
              <ChangeFileList
                changes={controlChanges(changes)}
                currentPath={selectedPath}
                onSelect={onOpenDiff}
              />
              <details className="workspace-inspector-disclosure">
                <summary>
                  <UiIcon icon={ChevronRight} size="sm" />
                  Git controls
                </summary>
                <GitControlPanel
                  active={active}
                  branches={records<RepositoryBranch>(
                    branchesResource.data?.branches,
                  )}
                  changes={controlChanges(changes)}
                  conflicts={records<RepositoryConflict>(
                    conflictsResource.data?.conflicts,
                  )}
                  onRefresh={onRefresh}
                  mutate={mutateRepository}
                  remotes={records<RepositoryRemote>(
                    remotesResource.data?.remotes,
                  )}
                  stashes={records<RepositoryStash>(
                    stashesResource.data?.stashes,
                  )}
                  variant="compact"
                  worktrees={records<{
                    path: string;
                    branch?: string;
                    current?: boolean;
                    prunable?: boolean;
                  }>(worktreeResource.data?.worktrees)}
                />
              </details>
            </>
          ) : (
            <p className="workspace-inspector-empty">
              Git status is unavailable for this workspace.
            </p>
          )
        ) : null}

        {utilityPane === "worktrees" ? (
          <ExecutionEnvironmentPanel
            active={active}
            canCreateWorktree={canCreateWorktree}
            error={worktreeResource.error}
            isRepository={summary.isRepository}
            loading={worktreeResource.loading}
            onChooseWorkspace={onChooseWorkspace}
            onOpenWorkspacePath={onOpenWorkspacePath}
            onRefresh={onRefresh}
            origin={origin}
            workspaceRoot={summary.root ?? ""}
            worktrees={worktreeResource.data?.worktrees}
          />
        ) : null}
      </div>
    </aside>
  );
}
