import { ContextActionMenu } from "@doolittle/ui";
import { FileStack, GitCompareArrows, Search } from "lucide-react";
import { type FormEvent, useId } from "react";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { WorkspaceFileTree } from "../components/WorkspaceFileTree";
import { copyContextText } from "../context-menu-clipboard";
import { type ApiResource, EmptyBlock, ErrorBlock, LoadingBlock } from "../lib";
import { CODE_EXPLORER_WIDTH } from "../panel-layout";
import type { WorkspaceTreeEntry } from "../workspace-file-tree";
import {
  CODING_CHANGE_BADGES_CLASS,
  CODING_CHANGE_BUTTON_CLASS,
  CODING_CHANGE_BUTTON_SELECTED_CLASS,
  CODING_CHANGE_CODE_CLASS,
  CODING_CHANGE_LIST_CLASS,
  CODING_CHANGE_NAME_CLASS,
  CODING_CHANGE_PATH_CLASS,
  CODING_EXPLORER_CLASS,
  CODING_EXPLORER_RESIZER_CLASS,
  CODING_PANE_BODY_CLASS,
  CODING_PANE_CLASS,
  CODING_SEARCH_CLASS,
  CODING_SEARCH_MATCH_CLASS,
  CODING_SEARCH_PATH_CLASS,
  CODING_SEARCH_RESULTS_CLASS,
  CODING_WORKTREE_FIELD_CLASS,
  CODING_WORKTREE_INPUT_CLASS,
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

export function CodingWorkspaceExplorer({
  width,
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
}: {
  width: number;
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
}) {
  const panelId = `coding-explorer-${useId().replace(/:/gu, "")}`;
  return (
    <aside
      id={`${panelId}-container`}
      className={`${CODING_PANE_CLASS} ${CODING_EXPLORER_CLASS}`}
    >
      <PanelResizeHandle
        bounds={resizeBounds}
        className={CODING_EXPLORER_RESIZER_CLASS}
        controls={`${panelId}-container`}
        direction="grow-right"
        label="Resize code explorer"
        onResize={onResize}
        value={width}
      />
      <PaneTabs<LeftPane>
        label="Explorer views"
        options={[
          { id: "files", label: "Files", icon: FileStack },
          {
            id: "changes",
            label: "Changes",
            count: changes.length,
            icon: GitCompareArrows,
          },
          { id: "search", label: "Search", icon: Search },
        ]}
        panelId={panelId}
        value={leftPane}
        onChange={onLeftPaneChange}
      />

      <div
        aria-labelledby={paneTabId(panelId, leftPane)}
        className={CODING_PANE_BODY_CLASS}
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
                onOpenFile={onOpenPath}
                selectedPath={selectedPath}
                truncated={treeResource.data?.truncated}
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
              <div className={CODING_CHANGE_LIST_CLASS}>
                {changes.map((change) => (
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
                      className={`${CODING_CHANGE_BUTTON_CLASS} ${selectedPath === change.path ? CODING_CHANGE_BUTTON_SELECTED_CLASS : ""}`}
                      onClick={() => onOpenPath(change.path, "diff")}
                      title={change.path}
                      type="button"
                    >
                      <span className={CODING_CHANGE_CODE_CLASS}>
                        {statusLabel(change)}
                      </span>
                      <span>
                        <strong className={CODING_CHANGE_NAME_CLASS}>
                          {fileName(change.path)}
                        </strong>
                        <small className={CODING_CHANGE_PATH_CLASS}>
                          {change.path}
                        </small>
                      </span>
                      <span className={CODING_CHANGE_BADGES_CLASS}>
                        {change.staged ? <i>staged</i> : null}
                        {change.unstaged ? <i>working</i> : null}
                      </span>
                    </button>
                  </ContextActionMenu>
                ))}
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
                <label className={CODING_WORKTREE_FIELD_CLASS}>
                  <span className="sr-only">Search workspace files</span>
                  <input
                    className={CODING_WORKTREE_INPUT_CLASS}
                    onChange={(event) =>
                      onSearchDraftChange(event.target.value)
                    }
                    placeholder="Search workspace"
                    value={searchDraft}
                  />
                </label>
                <button className="primary-button" type="submit">
                  Find
                </button>
              </form>
              {!searchQuery ? (
                <EmptyBlock title="Search the workspace">
                  Find matching lines across files without leaving the desktop.
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
