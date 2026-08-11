import { lazy, Suspense } from "react";
import type { CodeLanguage } from "../code-language";
import { type ApiResource, asString, ErrorBlock, LoadingBlock } from "../lib";
import type { WorkspaceTreeEntry } from "../workspace-file-tree";
import { compactWorkspacePath } from "../workspace-path";
import type { CodeEditorStateSnapshot } from "./CodeEditor";
import { WorkspaceFileTree } from "./WorkspaceFileTree";

const CodeEditor = lazy(async () => {
  const module = await import("./CodeEditor");
  return { default: module.CodeEditor };
});

export interface ThreadWorkbenchFilesTreeData {
  entries?: unknown[];
}

export interface ThreadWorkbenchFilesFileData {
  content?: string;
}

export interface ThreadWorkbenchFilesPanelProps {
  workspacePath: string;
  tree: ApiResource<ThreadWorkbenchFilesTreeData>;
  file: ApiResource<ThreadWorkbenchFilesFileData>;
  entries: WorkspaceTreeEntry[];
  selectedPath: string;
  selectedLanguage: CodeLanguage;
  onSelectPath: (path: string) => void;
  onInsertFileContext: () => void;
  onEditorStateChange: (snapshot: CodeEditorStateSnapshot) => void;
}

export function ThreadWorkbenchFilesPanel({
  workspacePath,
  tree,
  file,
  entries,
  selectedPath,
  selectedLanguage,
  onSelectPath,
  onInsertFileContext,
  onEditorStateChange,
}: ThreadWorkbenchFilesPanelProps) {
  return (
    <div className="thread-workbench-panel-body thread-workbench-panel-body--files">
      {tree.loading ? <LoadingBlock label="Loading workbench…" /> : null}
      {tree.error ? (
        <ErrorBlock error={tree.error} retry={tree.reload} />
      ) : null}
      {!tree.loading && !tree.error ? (
        <div className="thread-workbench-split thread-workbench-file-workspace">
          <div className="thread-workbench-tree">
            {entries.length ? (
              <WorkspaceFileTree
                entries={entries}
                key={workspacePath}
                onOpenFile={onSelectPath}
                selectedPath={selectedPath}
              />
            ) : (
              <p className="thread-workbench-empty">
                No files returned for this workspace.
              </p>
            )}
          </div>
          <div className="thread-workbench-preview thread-workbench-code-preview">
            {selectedPath ? (
              <>
                <div>
                  <code title={selectedPath}>
                    {compactWorkspacePath(selectedPath, 3)}
                  </code>
                  <span>{selectedLanguage.label}</span>
                  <div>
                    <button
                      disabled={!file.data?.content}
                      onClick={onInsertFileContext}
                      type="button"
                    >
                      Add to chat
                    </button>
                  </div>
                </div>
                {file.loading ? (
                  <LoadingBlock label="Reading file…" />
                ) : file.error ? (
                  <ErrorBlock error={file.error} retry={file.reload} />
                ) : (
                  <div className="thread-workbench-monaco">
                    <Suspense
                      fallback={
                        <div
                          aria-label={`Loading preview ${selectedPath}`}
                          role="status"
                        >
                          Loading editor…
                        </div>
                      }
                    >
                      <CodeEditor
                        ariaLabel={`Preview ${selectedPath}`}
                        compact
                        disabled
                        language={selectedLanguage}
                        onChange={() => undefined}
                        onEditorStateChange={onEditorStateChange}
                        onSave={() => undefined}
                        path={selectedPath}
                        value={asString(file.data?.content)}
                        workspacePath={workspacePath}
                      />
                    </Suspense>
                  </div>
                )}
              </>
            ) : (
              <div className="thread-workbench-file-empty">
                <span
                  aria-hidden="true"
                  className="thread-workbench-file-empty-icon"
                >
                  &lt;/&gt;
                </span>
                <strong>Select a file</strong>
                <p>
                  Expand the repository tree to inspect a syntax-aware preview.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
