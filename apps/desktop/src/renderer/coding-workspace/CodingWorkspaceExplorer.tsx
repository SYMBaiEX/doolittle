import { ContextActionMenu } from "@doolittle/ui";
import { FileStack, GitCompareArrows, Search } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useMemo } from "react";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { UiIcon } from "../components/UiIcon";
import { WorkspaceFileIcon } from "../components/WorkspaceFileIcon";
import {
  type WorkspaceFileStatus,
  WorkspaceFileTree,
} from "../components/WorkspaceFileTree";
import { copyContextText } from "../context-menu-clipboard";
import { type ApiResource, EmptyBlock, ErrorBlock, LoadingBlock } from "../lib";
import { CODE_EXPLORER_WIDTH } from "../panel-layout";
import { gitChangeLabel } from "../repository-control";
import type { WorkspaceTreeEntry } from "../workspace-file-tree";
import {
  CODING_EXPLORER_CLASS,
  CODING_EXPLORER_RESIZER_CLASS,
  CODING_EXPLORER_TABS_CLASS,
  CODING_PANE_BODY_CLASS,
  CODING_PANE_CLASS,
  CODING_PANE_OVERLAY_CLASS,
  CODING_PANE_TABS_CLASS,
  CODING_SEARCH_CLASS,
  CODING_SEARCH_MATCH_CLASS,
  CODING_SEARCH_PATH_CLASS,
  CODING_SEARCH_RESULTS_CLASS,
} from "./layout";
import type {
  LeftPane,
  RepositoryChange,
  RepositoryChangesResponse,
  SearchResult,
  WorkspaceSearchResponse,
  WorkspaceTreeResponse,
} from "./models";
import { fileName, statusLabel } from "./models";
import { PaneTabs, paneTabId } from "./PaneTabs";
import "./explorer-chrome.css";

function workspaceStatus(change: RepositoryChange): WorkspaceFileStatus {
  const code = statusLabel(change);
  const state = gitChangeLabel({ ...change, status: code });
  const scope = change.untracked
    ? ""
    : change.staged && change.unstaged
      ? " · Staged and working tree"
      : change.staged
        ? " · Staged"
        : " · Working tree";
  return {
    code,
    label: state + scope,
    tone:
      state === "Deleted"
        ? "removal"
        : state === "Added" || change.untracked
          ? "addition"
          : "changed",
  };
}

export function CodingWorkspaceExplorer({
  width,
  dismissControl,
  inert,
  resizeBounds = CODE_EXPLORER_WIDTH,
  onResize,
  leftPane,
  onLeftPaneChange,
  treeResource,
  treeEntries,
  changesResource,
  changes,
  selectedPath,
  onOpenPath,
  searchDraft,
  searchQuery,
  searchResource,
  searchResults,
  onSearchDraftChange,
  onSubmitSearch,
  contextScope = "",
  workspaceName,
}: {
  width: number;
  dismissControl?: ReactNode;
  inert?: boolean;
  resizeBounds?: { default: number; min: number; max: number };
  onResize: (value: number) => void;
  leftPane: LeftPane;
  onLeftPaneChange: (value: LeftPane) => void;
  treeResource: ApiResource<WorkspaceTreeResponse>;
  treeEntries: WorkspaceTreeEntry[];
  changesResource: ApiResource<RepositoryChangesResponse>;
  changes: RepositoryChange[];
  selectedPath: string;
  onOpenPath: (path: string, destination?: "file" | "diff") => boolean;
  searchDraft: string;
  searchQuery: string;
  searchResource: ApiResource<WorkspaceSearchResponse>;
  searchResults: SearchResult[];
  onSearchDraftChange: (value: string) => void;
  onSubmitSearch: (event: FormEvent<HTMLFormElement>) => void;
  /** Immutable bot/conversation/workspace identity, separate from visible selection. */
  contextScope?: string;
  workspaceName?: string;
}) {
  const panelId = `coding-explorer-${useId().replace(/:/gu, "")}`;
  const statuses = useMemo(
    () =>
      new Map(changes.map((change) => [change.path, workspaceStatus(change)])),
    [changes],
  );
  return (
    <aside
      aria-label="Workspace explorer"
      data-code-pane="explorer"
      data-overlay={Boolean(dismissControl)}
      id={`${panelId}-container`}
      inert={inert}
      className={`${CODING_PANE_CLASS} ${CODING_PANE_OVERLAY_CLASS} ${CODING_EXPLORER_CLASS}`}
    >
      {!dismissControl && (
        <PanelResizeHandle
          bounds={resizeBounds}
          className={CODING_EXPLORER_RESIZER_CLASS}
          controls={`${panelId}-container`}
          direction="grow-right"
          label="Resize code explorer"
          onResize={onResize}
          value={width}
        />
      )}
      <div
        className={`${CODING_PANE_TABS_CLASS} ${CODING_EXPLORER_TABS_CLASS}`}
        data-compact={Boolean(dismissControl)}
      >
        <PaneTabs<LeftPane>
          label="Explorer views"
          options={[
            { id: "files", label: "Files", icon: FileStack },
            {
              id: "changes",
              label: "Changes",
              icon: GitCompareArrows,
              count: changes.length || undefined,
            },
            { id: "search", label: "Search", icon: Search },
          ]}
          panelId={panelId}
          value={leftPane}
          onChange={onLeftPaneChange}
        />
        {dismissControl}
      </div>

      <div
        aria-labelledby={paneTabId(panelId, leftPane)}
        className={`${CODING_PANE_BODY_CLASS} ide-explorer-panel`}
        data-pane={leftPane}
        id={panelId}
        role="tabpanel"
      >
        {leftPane === "files" ? (
          <ContextActionMenu
            label="Workspace explorer"
            scopeKey={`${contextScope}:${leftPane}`}
            items={[
              {
                id: "refresh-files",
                label: "Refresh workspace files",
                onSelect: treeResource.reload,
              },
            ]}
          >
            {treeResource.loading ? (
              <LoadingBlock label="Reading workspace tree…" />
            ) : treeResource.error ? (
              <ErrorBlock
                error={treeResource.error}
                retry={treeResource.reload}
              />
            ) : treeEntries.length ? (
              <WorkspaceFileTree
                contextScope={contextScope}
                entries={treeEntries}
                filterable
                onOpenFile={onOpenPath}
                onRefresh={treeResource.reload}
                selectedPath={selectedPath}
                statuses={statuses}
                truncated={treeResource.data?.truncated}
                workspaceName={workspaceName}
              />
            ) : (
              <EmptyBlock title="Workspace is empty">
                Files appear here when the runtime exposes a workspace tree.
              </EmptyBlock>
            )}
          </ContextActionMenu>
        ) : null}

        {leftPane === "changes" ? (
          <ContextActionMenu
            label="Workspace changes"
            scopeKey={`${contextScope}:${leftPane}`}
            items={[
              {
                id: "refresh-changes",
                label: "Refresh changes",
                onSelect: changesResource.reload,
              },
            ]}
          >
            {changesResource.loading ? (
              <LoadingBlock label="Inspecting Git changes…" />
            ) : changesResource.error ? (
              <ErrorBlock
                error={changesResource.error}
                retry={changesResource.reload}
              />
            ) : changes.length ? (
              <div className="ide-change-files">
                {changes.map((change) => {
                  const name = fileName(change.path);
                  const directory = change.path.slice(0, -(name.length + 1));
                  const status = statuses.get(change.path);
                  return (
                    <ContextActionMenu
                      key={change.path}
                      label={`Changed file: ${change.path}`}
                      scopeKey={`${contextScope}:${change.path}`}
                      items={[
                        {
                          id: "open-diff",
                          label: "Open diff",
                          onSelect: () => {
                            onOpenPath(change.path, "diff");
                          },
                        },
                        {
                          id: "open-file",
                          label: "Open file",
                          onSelect: () => {
                            onOpenPath(change.path, "file");
                          },
                        },
                        {
                          id: "copy-path",
                          label: "Copy relative path",
                          separatorBefore: true,
                          onSelect: () => copyContextText(change.path),
                        },
                      ]}
                    >
                      <button
                        aria-current={
                          selectedPath === change.path ? "true" : undefined
                        }
                        aria-description={status?.label}
                        className="ide-change-file"
                        onClick={() => onOpenPath(change.path, "diff")}
                        title={`${change.path}${status ? ` · ${status.label}` : ""}`}
                        type="button"
                      >
                        <WorkspaceFileIcon path={change.path} />
                        <span className="ide-change-description">
                          <strong>{name}</strong>
                          {directory ? <small>{directory}</small> : null}
                        </span>
                        <span
                          aria-hidden="true"
                          className="workspace-tree-status"
                          data-tone={status?.tone}
                        >
                          {status?.code}
                        </span>
                      </button>
                    </ContextActionMenu>
                  );
                })}
              </div>
            ) : (
              <EmptyBlock title="Working tree clean">
                No staged, unstaged, or untracked files were reported.
              </EmptyBlock>
            )}
          </ContextActionMenu>
        ) : null}

        {leftPane === "search" ? (
          <ContextActionMenu
            label="Workspace search"
            scopeKey={`${contextScope}:${leftPane}:${searchQuery}`}
            items={[
              {
                id: "refresh-search",
                label: "Refresh search results",
                disabled: !searchQuery,
                onSelect: searchResource.reload,
              },
            ]}
          >
            <div className={CODING_SEARCH_CLASS}>
              <form onSubmit={onSubmitSearch}>
                <label>
                  <span className="sr-only">Search workspace files</span>
                  <input
                    onChange={(event) =>
                      onSearchDraftChange(event.target.value)
                    }
                    placeholder="Search workspace"
                    value={searchDraft}
                  />
                </label>
                <button
                  aria-label="Find in workspace"
                  className="ide-search-submit"
                  title="Find in workspace"
                  type="submit"
                >
                  <UiIcon icon={Search} size="xs" />
                </button>
              </form>
              {!searchQuery ? (
                <EmptyBlock title="Search across files">
                  Enter text to find matching lines.
                </EmptyBlock>
              ) : searchResource.loading ? (
                <LoadingBlock label={`Searching for “${searchQuery}”…`} />
              ) : searchResource.error ? (
                <ErrorBlock
                  error={searchResource.error}
                  retry={searchResource.reload}
                />
              ) : searchResults.length ? (
                <div className={CODING_SEARCH_RESULTS_CLASS}>
                  {searchResults.map((result) => (
                    <ContextActionMenu
                      key={result.path}
                      label={`Search result: ${result.path}`}
                      scopeKey={`${contextScope}:${searchQuery}:${result.path}`}
                      items={[
                        {
                          id: "open-file",
                          label: "Open file",
                          onSelect: () => {
                            onOpenPath(result.path);
                          },
                        },
                        {
                          id: "copy-path",
                          label: "Copy relative path",
                          separatorBefore: true,
                          onSelect: () => copyContextText(result.path),
                        },
                        {
                          id: "copy-matches",
                          label: "Copy matching lines",
                          onSelect: () =>
                            copyContextText(result.matches.join("\n")),
                        },
                      ]}
                    >
                      <button
                        onClick={() => onOpenPath(result.path)}
                        title={result.path}
                        type="button"
                      >
                        <strong className={CODING_SEARCH_PATH_CLASS}>
                          {result.path}
                        </strong>
                        {result.matches.map((match) => (
                          <small
                            className={CODING_SEARCH_MATCH_CLASS}
                            key={`${result.path}:${match}`}
                          >
                            {match}
                          </small>
                        ))}
                      </button>
                    </ContextActionMenu>
                  ))}
                </div>
              ) : (
                <EmptyBlock title="No matches">
                  No workspace lines matched “{searchQuery}”.
                </EmptyBlock>
              )}
            </div>
          </ContextActionMenu>
        ) : null}
      </div>
    </aside>
  );
}
