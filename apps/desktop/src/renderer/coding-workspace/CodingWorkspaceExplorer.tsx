import type { FormEvent } from "react";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { WorkspaceFileTree } from "../components/WorkspaceFileTree";
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
import { PaneTabs } from "./PaneTabs";

export function CodingWorkspaceExplorer({
  width,
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
}: {
  width: number;
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
}) {
  return (
    <aside className={`${CODING_PANE_CLASS} ${CODING_EXPLORER_CLASS}`}>
      <PanelResizeHandle
        bounds={CODE_EXPLORER_WIDTH}
        className={CODING_EXPLORER_RESIZER_CLASS}
        direction="grow-right"
        label="Resize code explorer"
        onResize={onResize}
        value={width}
      />
      <PaneTabs<LeftPane>
        label="Explorer views"
        options={[
          { id: "files", label: "Files" },
          { id: "changes", label: "Changes", count: changes.length },
          { id: "search", label: "Search" },
        ]}
        value={leftPane}
        onChange={onLeftPaneChange}
      />

      <div className={CODING_PANE_BODY_CLASS} role="tabpanel">
        {leftPane === "files" ? (
          treeResource.loading ? (
            <LoadingBlock label="Reading workspace tree…" />
          ) : treeResource.error ? (
            <ErrorBlock
              error={treeResource.error}
              retry={treeResource.reload}
            />
          ) : treeEntries.length ? (
            <WorkspaceFileTree
              entries={treeEntries}
              onOpenFile={onOpenPath}
              selectedPath={selectedPath}
              truncated={treeResource.data?.truncated}
            />
          ) : (
            <EmptyBlock title="Workspace is empty">
              Files appear here when the runtime exposes a workspace tree.
            </EmptyBlock>
          )
        ) : null}

        {leftPane === "changes" ? (
          changesResource.loading ? (
            <LoadingBlock label="Inspecting Git changes…" />
          ) : changesResource.error ? (
            <ErrorBlock
              error={changesResource.error}
              retry={changesResource.reload}
            />
          ) : changes.length ? (
            <div className={CODING_CHANGE_LIST_CLASS}>
              {changes.map((change) => (
                <button
                  className={`${CODING_CHANGE_BUTTON_CLASS} ${selectedPath === change.path ? CODING_CHANGE_BUTTON_SELECTED_CLASS : ""}`}
                  key={change.path}
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
              ))}
            </div>
          ) : (
            <EmptyBlock title="Working tree clean">
              No staged, unstaged, or untracked files were reported.
            </EmptyBlock>
          )
        ) : null}

        {leftPane === "search" ? (
          <div className={CODING_SEARCH_CLASS}>
            <form onSubmit={onSubmitSearch}>
              <label className={CODING_WORKTREE_FIELD_CLASS}>
                <span className="sr-only">Search workspace files</span>
                <input
                  className={CODING_WORKTREE_INPUT_CLASS}
                  onChange={(event) => onSearchDraftChange(event.target.value)}
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
                  <button
                    key={result.path}
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
                ))}
              </div>
            ) : (
              <EmptyBlock title="No matches">
                No workspace lines matched “{searchQuery}”.
              </EmptyBlock>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
