import { lazy, Suspense } from "react";
import type { CodeLanguage } from "../code-language";
import { type ApiResource, asString, ErrorBlock, LoadingBlock } from "../lib";
import {
  WORKBENCH_CODE_PREVIEW_CLASS,
  WORKBENCH_EMPTY_CLASS,
  WORKBENCH_FILE_EMPTY_CLASS,
  WORKBENCH_FILE_EMPTY_ICON_CLASS,
  WORKBENCH_FILE_SPLIT_CLASS,
  WORKBENCH_FILES_BODY_CLASS,
  WORKBENCH_MONACO_CLASS,
  WORKBENCH_TREE_CLASS,
} from "../thread-workbench/layout";
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
  truncated?: boolean;
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
    <div
      className={WORKBENCH_FILES_BODY_CLASS}
      data-thread-workbench-panel="files"
    >
      {tree.loading ? <LoadingBlock label="Loading workbench…" /> : null}
      {tree.error ? (
        <ErrorBlock error={tree.error} retry={tree.reload} />
      ) : null}
      {!tree.loading && !tree.error ? (
        <div className={WORKBENCH_FILE_SPLIT_CLASS}>
          <div className={WORKBENCH_TREE_CLASS}>
            {entries.length ? (
              <WorkspaceFileTree
                entries={entries}
                key={workspacePath}
                onOpenFile={onSelectPath}
                selectedPath={selectedPath}
                truncated={tree.data?.truncated}
              />
            ) : (
              <p className={WORKBENCH_EMPTY_CLASS}>
                No files returned for this workspace.
              </p>
            )}
          </div>
          <div className={WORKBENCH_CODE_PREVIEW_CLASS}>
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
                  <div className={WORKBENCH_MONACO_CLASS}>
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
              <div className={WORKBENCH_FILE_EMPTY_CLASS}>
                <span
                  aria-hidden="true"
                  className={WORKBENCH_FILE_EMPTY_ICON_CLASS}
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
