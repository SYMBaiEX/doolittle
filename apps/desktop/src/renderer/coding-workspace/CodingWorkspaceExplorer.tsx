import type { FormEvent } from "react";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { WorkspaceFileTree } from "../components/WorkspaceFileTree";
import { type ApiResource, EmptyBlock, ErrorBlock, LoadingBlock } from "../lib";
import { CODE_EXPLORER_WIDTH } from "../panel-layout";
import type { WorkspaceTreeEntry } from "../workspace-file-tree";
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
    <aside className="coding-pane coding-explorer">
      <PanelResizeHandle
        bounds={CODE_EXPLORER_WIDTH}
        className="coding-explorer-resizer"
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

      <div className="coding-pane-body" role="tabpanel">
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
            <div className="coding-change-list">
              {changes.map((change) => (
                <button
                  className={selectedPath === change.path ? "selected" : ""}
                  key={change.path}
                  onClick={() => onOpenPath(change.path, "diff")}
                  title={change.path}
                  type="button"
                >
                  <span className="coding-change-code">
                    {statusLabel(change)}
                  </span>
                  <span>
                    <strong className="coding-change-name">
                      {fileName(change.path)}
                    </strong>
                    <small className="coding-change-path">{change.path}</small>
                  </span>
                  <span className="coding-change-badges">
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
          <div className="coding-search">
            <form onSubmit={onSubmitSearch}>
              <label className="coding-worktree-field">
                <span className="sr-only">Search workspace files</span>
                <input
                  className="coding-worktree-input"
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
              <div className="coding-search-results">
                {searchResults.map((result) => (
                  <button
                    key={result.path}
                    onClick={() => onOpenPath(result.path)}
                    title={result.path}
                    type="button"
                  >
                    <strong className="coding-search-path">
                      {result.path}
                    </strong>
                    {result.matches.map((match) => (
                      <small
                        className="coding-search-match"
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
