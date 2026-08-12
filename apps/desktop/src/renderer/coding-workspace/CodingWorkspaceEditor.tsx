import type { RepositoryMutationRequest } from "@doolittle/contracts/repository";
import { type FormEvent, lazy, Suspense } from "react";
import type { CodeLanguage } from "../code-language";
import type { CodeEditorStateSnapshot } from "../components/CodeEditor";
import type {
  DesktopAcpPhase,
  DesktopAcpPromptPhase,
  DesktopAcpSessionUpdate,
} from "../desktop-acp-client";
import { type ApiResource, EmptyBlock, ErrorBlock, LoadingBlock } from "../lib";
import type {
  ActionNotice,
  EditorPane,
  RepositoryChange,
  RepositoryPatchResponse,
  WorkspaceReadResponse,
} from "./models";
import { fileName, patchLines, statusLabel } from "./models";
import { PaneTabs } from "./PaneTabs";

const CodeEditor = lazy(async () => {
  const module = await import("../components/CodeEditor");
  return { default: module.CodeEditor };
});

type VisiblePatchMutation = Extract<
  RepositoryMutationRequest["type"],
  "stage-hunk" | "unstage-hunk" | "discard-hunk"
>;

export interface CodingWorkspaceAcpViewModel {
  cancel: () => Promise<void>;
  error: string;
  lastUpdateLabel: string;
  phase: DesktopAcpPhase;
  promptBusy: boolean;
  promptError: string;
  promptPhase: DesktopAcpPromptPhase;
  responseText: string;
  sessionId: string;
  stopReason: string;
  updates: readonly DesktopAcpSessionUpdate[];
}

export function CodingWorkspaceEditor({
  editorPane,
  onEditorPaneChange,
  selectedPath,
  selectedLanguage,
  selectedChange,
  stagedPatch,
  onSetStagedPatch,
  fileResource,
  patchResource,
  fileNotice,
  fileDirty,
  savingFile,
  draftContent,
  workspacePath,
  acpEditor,
  acpTaskOpen,
  acpTaskDraft,
  onDraftChange,
  onEditorStateChange,
  onSave,
  onDiscard,
  onMutateVisiblePatch,
  onAcpTaskOpenChange,
  onAcpTaskDraftChange,
  onSubmitAcpTask,
  onSendSelectedContext,
}: {
  editorPane: EditorPane;
  onEditorPaneChange: (value: EditorPane) => void;
  selectedPath: string;
  selectedLanguage: CodeLanguage;
  selectedChange: RepositoryChange | undefined;
  stagedPatch: boolean;
  onSetStagedPatch: (value: boolean) => void;
  fileResource: ApiResource<WorkspaceReadResponse>;
  patchResource: ApiResource<RepositoryPatchResponse>;
  fileNotice: ActionNotice | null;
  fileDirty: boolean;
  savingFile: boolean;
  draftContent: string;
  workspacePath: string;
  acpEditor: CodingWorkspaceAcpViewModel;
  acpTaskOpen: boolean;
  acpTaskDraft: string;
  onDraftChange: (value: string) => void;
  onEditorStateChange: (snapshot: CodeEditorStateSnapshot) => void;
  onSave: () => void;
  onDiscard: () => void;
  onMutateVisiblePatch: (type: VisiblePatchMutation) => void | Promise<void>;
  onAcpTaskOpenChange: (open: boolean) => void;
  onAcpTaskDraftChange: (value: string) => void;
  onSubmitAcpTask: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onSendSelectedContext: () => void;
}) {
  return (
    <main className="coding-pane coding-editor">
      <div className="coding-editor-toolbar">
        <PaneTabs<EditorPane>
          label="Editor views"
          options={[
            { id: "file", label: "File" },
            { id: "diff", label: "Diff" },
          ]}
          value={editorPane}
          onChange={onEditorPaneChange}
        />
        <div className="coding-breadcrumb" title={selectedPath}>
          <span>{selectedPath || "Select a file"}</span>
          {selectedPath ? <small>{selectedLanguage.label}</small> : null}
        </div>
        {editorPane === "file" && selectedPath ? (
          <div className="coding-editor-actions">
            {fileDirty ? (
              <span className="coding-unsaved-indicator" role="status">
                Unsaved
              </span>
            ) : null}
            <button
              className="secondary-button"
              disabled={!fileDirty || savingFile}
              onClick={onDiscard}
              type="button"
            >
              Discard
            </button>
            <button
              className="primary-button"
              disabled={!fileDirty || savingFile}
              onClick={onSave}
              type="button"
            >
              {savingFile ? "Saving…" : "Save"}
            </button>
          </div>
        ) : editorPane === "diff" && selectedChange ? (
          <div className="coding-editor-actions">
            {selectedChange.staged ? (
              <fieldset aria-label="Diff source" className="coding-diff-source">
                <legend className="sr-only">Diff source</legend>
                {selectedChange.unstaged ? (
                  <button
                    aria-pressed={!stagedPatch}
                    className={!stagedPatch ? "selected" : ""}
                    onClick={() => onSetStagedPatch(false)}
                    type="button"
                  >
                    Working
                  </button>
                ) : null}
                <button
                  aria-pressed={stagedPatch}
                  className={stagedPatch ? "selected" : ""}
                  onClick={() => onSetStagedPatch(true)}
                  type="button"
                >
                  Staged
                </button>
              </fieldset>
            ) : null}
            {patchResource.data?.patch?.patch &&
            !patchResource.data.patch.truncated ? (
              stagedPatch ? (
                <button
                  className="secondary-button"
                  onClick={() => void onMutateVisiblePatch("unstage-hunk")}
                  type="button"
                >
                  Unstage patch
                </button>
              ) : (
                <>
                  {!selectedChange.untracked ? (
                    <button
                      className="danger-button"
                      onClick={() => void onMutateVisiblePatch("discard-hunk")}
                      type="button"
                    >
                      Discard patch
                    </button>
                  ) : null}
                  <button
                    className="primary-button"
                    onClick={() => void onMutateVisiblePatch("stage-hunk")}
                    type="button"
                  >
                    Stage patch
                  </button>
                </>
              )
            ) : null}
          </div>
        ) : null}
      </div>

      <section
        aria-label={
          selectedPath
            ? `${editorPane === "file" ? "File editor" : "Git diff"}: ${selectedPath}`
            : "File editor"
        }
        className="coding-editor-surface"
        role="tabpanel"
      >
        {!selectedPath ? (
          <EmptyBlock title="Choose a file">
            Select a workspace file or changed file to inspect it here.
          </EmptyBlock>
        ) : editorPane === "file" ? (
          fileResource.loading ? (
            <LoadingBlock label={`Opening ${fileName(selectedPath)}…`} />
          ) : fileResource.error ? (
            <ErrorBlock
              error={fileResource.error}
              retry={fileResource.reload}
            />
          ) : (
            <>
              {fileNotice ? (
                <div
                  aria-live="polite"
                  className={`coding-action-notice ${fileNotice.tone}`}
                  role="status"
                >
                  {fileNotice.message}
                </div>
              ) : null}
              <Suspense
                fallback={
                  <LoadingBlock
                    label={`Loading editor ${fileName(selectedPath)}…`}
                  />
                }
              >
                <CodeEditor
                  disabled={savingFile}
                  language={selectedLanguage}
                  onChange={onDraftChange}
                  onEditorStateChange={onEditorStateChange}
                  onSave={onSave}
                  path={selectedPath}
                  value={draftContent}
                  workspacePath={workspacePath}
                />
              </Suspense>
            </>
          )
        ) : !selectedChange ? (
          <EmptyBlock title="No Git change for this file">
            Choose a changed file from the Changes pane to inspect its patch.
          </EmptyBlock>
        ) : patchResource.loading ? (
          <LoadingBlock
            label={`Building patch for ${fileName(selectedPath)}…`}
          />
        ) : patchResource.error ? (
          <ErrorBlock
            error={patchResource.error}
            retry={patchResource.reload}
          />
        ) : patchResource.data?.patch?.patch ? (
          <>
            {fileNotice ? (
              <div
                aria-live="polite"
                className={`coding-action-notice ${fileNotice.tone}`}
                role="status"
              >
                {fileNotice.message}
              </div>
            ) : null}
            {patchResource.data.patch.truncated ? (
              <div className="coding-inline-state warn">
                This large patch was truncated by the runtime.
              </div>
            ) : null}
            <pre className="coding-source coding-patch">
              <code>
                {patchLines(patchResource.data.patch.patch).map((line) => (
                  <span
                    className={`coding-diff-line ${line.tone}`}
                    key={line.key}
                  >
                    {line.text || " "}
                  </span>
                ))}
              </code>
            </pre>
          </>
        ) : (
          <EmptyBlock title="No patch output">
            The {stagedPatch ? "staged" : "working-tree"} version of this file
            has no textual patch.
          </EmptyBlock>
        )}
      </section>

      {acpTaskOpen ? (
        <form
          aria-label="ACP editor task"
          className="coding-acp-task"
          onSubmit={(event) => void onSubmitAcpTask(event)}
        >
          <div className="coding-acp-task-row">
            <label
              className="coding-acp-task-label"
              htmlFor="coding-acp-task-input"
            >
              <span>ACP task</span>
              <small>
                {selectedPath
                  ? `Current Monaco context · ${fileName(selectedPath)}`
                  : "Workspace context"}
              </small>
            </label>
            <input
              disabled={acpEditor.promptBusy}
              id="coding-acp-task-input"
              onChange={(event) => onAcpTaskDraftChange(event.target.value)}
              placeholder="Inspect, edit, test, or explain…"
              value={acpTaskDraft}
            />
            {acpEditor.promptBusy ? (
              <button
                className="secondary-button"
                disabled={acpEditor.promptPhase === "cancelling"}
                onClick={() => void acpEditor.cancel()}
                type="button"
              >
                {acpEditor.promptPhase === "cancelling"
                  ? "Cancelling…"
                  : "Cancel"}
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={
                  acpEditor.phase !== "connected" || !acpTaskDraft.trim()
                }
                type="submit"
              >
                Run
              </button>
            )}
            <button
              aria-label="Close ACP editor task"
              className="ghost-button coding-acp-task-close"
              onClick={() => onAcpTaskOpenChange(false)}
              type="button"
            >
              ×
            </button>
          </div>
          {acpEditor.promptError ? (
            <p className="coding-acp-task-error" role="alert">
              {acpEditor.promptError}
            </p>
          ) : acpEditor.responseText ? (
            <output className="coding-acp-task-output">
              {acpEditor.responseText}
            </output>
          ) : acpEditor.promptBusy ? (
            <p className="coding-acp-task-progress" role="status">
              {acpEditor.lastUpdateLabel
                ? `${acpEditor.lastUpdateLabel} · ${acpEditor.updates.length} updates`
                : "Doolittle is working through ACP…"}
            </p>
          ) : acpEditor.stopReason ? (
            <p className="coding-acp-task-progress" role="status">
              ACP task finished · {acpEditor.stopReason}
            </p>
          ) : null}
        </form>
      ) : null}
      <footer className="coding-editor-status">
        <span
          className={
            fileDirty ? "coding-modified-status" : "coding-editable-status"
          }
        >
          {editorPane === "diff"
            ? "REVIEW"
            : fileDirty
              ? "MODIFIED"
              : "EDITABLE"}
        </span>
        <span>{selectedLanguage.label}</span>
        <span>UTF-8</span>
        {editorPane === "file" ? <span>⌘/Ctrl S to save</span> : null}
        <span
          className={`coding-acp-status ${acpEditor.phase}`}
          title={
            acpEditor.error ||
            (acpEditor.sessionId
              ? `ACP session ${acpEditor.sessionId}`
              : "ACP editor context")
          }
        >
          <i aria-hidden="true" />
          ACP{" "}
          {acpEditor.phase === "connected"
            ? "live"
            : acpEditor.phase === "degraded"
              ? "offline"
              : acpEditor.phase === "connecting"
                ? "linking"
                : "idle"}
        </span>
        {acpEditor.updates.length > 0 ? (
          <span
            className="coding-acp-progress"
            title={
              acpEditor.lastUpdateLabel || "Structured ACP session updates"
            }
          >
            {acpEditor.lastUpdateLabel || "ACP"} · {acpEditor.updates.length}
          </span>
        ) : null}
        {acpEditor.promptBusy && !acpTaskOpen ? (
          <button
            className="coding-status-action coding-acp-cancel"
            onClick={() => void acpEditor.cancel()}
            type="button"
          >
            Cancel ACP
          </button>
        ) : null}
        <span className="coding-spacer" />
        <button
          aria-expanded={acpTaskOpen}
          className="coding-status-action coding-acp-task-toggle"
          onClick={() => onAcpTaskOpenChange(!acpTaskOpen)}
          type="button"
        >
          ACP task
        </button>
        {selectedPath ? (
          <button
            className="coding-status-action"
            onClick={onSendSelectedContext}
            type="button"
          >
            Ask Doolittle
          </button>
        ) : null}
        <span>{selectedChange ? statusLabel(selectedChange) : "TRACKED"}</span>
      </footer>
    </main>
  );
}
