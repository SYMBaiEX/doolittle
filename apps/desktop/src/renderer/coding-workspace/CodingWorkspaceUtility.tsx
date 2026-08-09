import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import type { WorkspacePickResult } from "../../shared/contracts";
import { ExecutionEnvironmentPanel } from "../components/ExecutionEnvironmentPanel";
import { GitControlPanel } from "../components/GitControlPanel";
import { InteractiveTerminal } from "../components/InteractiveTerminal";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import {
  type ApiResource,
  asArray,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
} from "../lib";
import { CODE_UTILITY_WIDTH } from "../panel-layout";
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
import { PaneTabs } from "./PaneTabs";

export function CodingWorkspaceUtility({
  active,
  workspacePath,
  summary,
  summaryLoading,
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
  onSendToChat,
  onChooseWorkspace,
  onOpenWorkspacePath,
}: {
  active: boolean;
  workspacePath: string;
  summary: RepositorySummary;
  summaryLoading: boolean;
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
  onSendToChat: (text: string) => void;
  onChooseWorkspace: () => Promise<WorkspacePickResult>;
  onOpenWorkspacePath: (path: string) => Promise<WorkspacePickResult>;
}) {
  return (
    <aside className="coding-pane coding-utility">
      <PanelResizeHandle
        bounds={CODE_UTILITY_WIDTH}
        className="coding-utility-resizer"
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
        value={utilityPane}
        onChange={onUtilityPaneChange}
      />
      <div className="coding-pane-body" role="tabpanel">
        {utilityPane === "terminal" ? (
          summaryLoading && !summary.root ? (
            <LoadingBlock label="Connecting terminal to workspace…" />
          ) : (
            <InteractiveTerminal
              active={active}
              onSendToChat={onSendToChat}
              workspacePath={summary.root || workspacePath || ""}
            />
          )
        ) : null}

        {utilityPane === "commits" ? (
          logResource.loading ? (
            <LoadingBlock label="Reading recent commits…" />
          ) : logResource.error ? (
            <ErrorBlock error={logResource.error} retry={logResource.reload} />
          ) : commits.length ? (
            <div className="coding-commit-list">
              {commits.map((commit) => (
                <article key={commit.id}>
                  <span aria-hidden="true" />
                  <div>
                    <strong className="coding-commit-subject">
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
