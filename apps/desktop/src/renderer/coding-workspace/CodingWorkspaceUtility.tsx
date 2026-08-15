import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import type { WorkspacePickResult } from "../../shared/contracts";
import { ExecutionEnvironmentPanel } from "../components/ExecutionEnvironmentPanel";
import { GitControlPanel } from "../components/GitControlPanel";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import {
  type ApiResource,
  asArray,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from "../lib";
import { CODE_UTILITY_WIDTH } from "../panel-layout";
import {
  CODING_COMMIT_LIST_CLASS,
  CODING_COMMIT_SUBJECT_CLASS,
  CODING_PANE_BODY_CLASS,
  CODING_PANE_CLASS,
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

const UTILITY_PANEL_ID = "coding-utility-panel";

export function CodingWorkspaceUtility({
  active,
  summary,
  utilityPane,
  onUtilityPaneChange,
  width,
  onResize,
  commits,
  changes,
  logResource,
  branchesResource,
  remotesResource,
  stashesResource,
  conflictsResource,
  worktreeResource,
  onRefresh,
  onChooseWorkspace,
  onOpenWorkspacePath,
  onOpenTerminal,
}: {
  active: boolean;
  summary: RepositorySummary;
  utilityPane: UtilityPane;
  onUtilityPaneChange: (value: UtilityPane) => void;
  width: number;
  onResize: (value: number) => void;
  commits: CommitRow[];
  changes: RepositoryChange[];
  logResource: ApiResource<RepositoryLogResponse>;
  branchesResource: ApiResource<RepositoryBranchesResponse>;
  remotesResource: ApiResource<RepositoryRemotesResponse>;
  stashesResource: ApiResource<RepositoryStashesResponse>;
  conflictsResource: ApiResource<RepositoryConflictsResponse>;
  worktreeResource: ApiResource<RepositoryWorktreesResponse>;
  onRefresh: () => void;
  onChooseWorkspace: () => Promise<WorkspacePickResult>;
  onOpenWorkspacePath: (path: string) => Promise<WorkspacePickResult>;
  onOpenTerminal: () => void;
}) {
  return (
    <aside className={`${CODING_PANE_CLASS} ${CODING_UTILITY_CLASS}`}>
      <PanelResizeHandle
        bounds={CODE_UTILITY_WIDTH}
        className={CODING_UTILITY_RESIZER_CLASS}
        direction="grow-left"
        label="Resize code utility panel"
        onResize={onResize}
        value={width}
      />
      <PaneTabs<UtilityPane>
        label="Workspace utilities"
        options={[
          { id: "terminal", label: "Terminal" },
          { id: "commits", label: "Commits", count: commits.length },
          { id: "source-control", label: "Git", count: changes.length },
          {
            id: "worktrees",
            label: "Trees",
            count: asArray(worktreeResource.data?.worktrees).length,
          },
        ]}
        panelId={UTILITY_PANEL_ID}
        value={utilityPane}
        onChange={onUtilityPaneChange}
      />
      <div
        aria-labelledby={paneTabId(UTILITY_PANEL_ID, utilityPane)}
        className={CODING_PANE_BODY_CLASS}
        id={UTILITY_PANEL_ID}
        role="tabpanel"
      >
        {utilityPane === "terminal" ? (
          <EmptyBlock
            actions={
              <button
                className="primary-button"
                onClick={onOpenTerminal}
                type="button"
              >
                Open persistent terminal
              </button>
            }
            density="compact"
            title="Terminal lives with Chat"
          >
            Use the shared Chat terminal for this workspace. It stays open while
            you switch between Chat, Code, and Work.
          </EmptyBlock>
        ) : null}

        {utilityPane === "commits" ? (
          logResource.loading ? (
            <LoadingBlock label="Reading recent commits…" />
          ) : logResource.error ? (
            <ErrorBlock error={logResource.error} retry={logResource.reload} />
          ) : commits.length ? (
            <div className={CODING_COMMIT_LIST_CLASS}>
              {commits.map((commit) => (
                <article key={commit.id}>
                  <span aria-hidden="true" />
                  <div>
                    <strong className={CODING_COMMIT_SUBJECT_CLASS}>
                      {commit.subject}
                    </strong>
                    <code>{commit.hash}</code>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyBlock title="No commit history">
              Recent commits will appear when this workspace has Git history.
            </EmptyBlock>
          )
        ) : null}

        {utilityPane === "source-control" ? (
          <GitControlPanel
            active={active && summary.isRepository}
            branches={records<RepositoryBranch>(
              branchesResource.data?.branches,
            )}
            changes={controlChanges(changes)}
            conflicts={records<RepositoryConflict>(
              conflictsResource.data?.conflicts,
            )}
            onRefresh={onRefresh}
            remotes={records<RepositoryRemote>(remotesResource.data?.remotes)}
            stashes={records<RepositoryStash>(stashesResource.data?.stashes)}
            worktrees={records<{
              path: string;
              branch?: string;
              current?: boolean;
              prunable?: boolean;
            }>(worktreeResource.data?.worktrees)}
          />
        ) : null}

        {utilityPane === "worktrees" ? (
          <ExecutionEnvironmentPanel
            active={active}
            error={worktreeResource.error}
            isRepository={summary.isRepository}
            loading={worktreeResource.loading}
            onChooseWorkspace={onChooseWorkspace}
            onOpenWorkspacePath={onOpenWorkspacePath}
            onRefresh={onRefresh}
            workspaceRoot={summary.root ?? ""}
            worktrees={worktreeResource.data?.worktrees}
          />
        ) : null}
      </div>
    </aside>
  );
}
