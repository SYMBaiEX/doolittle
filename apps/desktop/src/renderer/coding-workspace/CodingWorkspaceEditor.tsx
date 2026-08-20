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
import {
  CODING_ACP_STATUS_CLASS,
  CODING_ACP_TASK_CLASS,
  CODING_ACP_TASK_CLOSE_CLASS,
  CODING_ACP_TASK_LABEL_CLASS,
  CODING_ACP_TASK_OUTPUT_CLASS,
  CODING_ACP_TASK_ROW_CLASS,
  CODING_ACTION_NOTICE_CLASS,
  CODING_BREADCRUMB_CLASS,
  CODING_DIFF_LINE_CLASS,
  CODING_DIFF_SOURCE_CLASS,
  CODING_DIFF_SOURCE_SELECTED_CLASS,
  CODING_EDITOR_ACTIONS_CLASS,
  CODING_EDITOR_CLASS,
  CODING_EDITOR_STATUS_CLASS,
  CODING_EDITOR_SURFACE_CLASS,
  CODING_EDITOR_TOOLBAR_CLASS,
  CODING_INLINE_STATE_CLASS,
  CODING_INLINE_WARN_CLASS,
  CODING_PANE_CLASS,
  CODING_PATCH_CLASS,
  CODING_SOURCE_CLASS,
  CODING_STATUS_ACTION_CLASS,
  CODING_UNSAVED_CLASS,
  codingActionNoticeTone,
  codingDiffLineTone,
} from "./layout";
import type {
  ActionNotice,
  EditorPane,
  RepositoryChange,
  RepositoryPatchResponse,
  WorkspaceReadResponse,
} from "./models";
import { fileName, patchLines, statusLabel } from "./models";
import { PaneTabs, paneTabId } from "./PaneTabs";

const EDITOR_PANEL_ID = "coding-editor-panel";

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
  retryConnection: () => Promise<void>;
  sessionId: string;
  stopReason: string;
  updates: readonly DesktopAcpSessionUpdate[];
}

export function CodingWorkspaceEditor({
  editorPane,
  editingLocked,
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
  editingLocked: boolean;
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
    <main className={`${CODING_PANE_CLASS} ${CODING_EDITOR_CLASS}`}>
      <div className={CODING_EDITOR_TOOLBAR_CLASS}>
        <PaneTabs<EditorPane>
          label="Editor views"
          options={[
            { id: "file", label: "File" },
            { id: "diff", label: "Diff" },
          ]}
          panelId={EDITOR_PANEL_ID}
          value={editorPane}
          onChange={onEditorPaneChange}
        />
        <div className={CODING_BREADCRUMB_CLASS} title={selectedPath}>
          <span>{selectedPath || "Select a file"}</span>
          {selectedPath ? <small>{selectedLanguage.label}</small> : null}
        </div>
        {editorPane === "file" && selectedPath ? (
          <div className={CODING_EDITOR_ACTIONS_CLASS}>
            {fileDirty ? (
              <span className={CODING_UNSAVED_CLASS} role="status">
                Unsaved
              </span>
            ) : null}
            <button
              className="secondary-button"
              disabled={editingLocked || !fileDirty || savingFile}
              onClick={onDiscard}
              type="button"
            >
              Discard
            </button>
            <button
              className="primary-button"
              disabled={editingLocked || !fileDirty || savingFile}
              onClick={onSave}
              type="button"
            >
              {savingFile ? "Saving…" : "Save"}
            </button>
          </div>
        ) : editorPane === "diff" && selectedChange ? (
          <div className={CODING_EDITOR_ACTIONS_CLASS}>
            {selectedChange.staged ? (
              <fieldset
                aria-label="Diff source"
                className={CODING_DIFF_SOURCE_CLASS}
              >
                <legend className="sr-only">Diff source</legend>
                {selectedChange.unstaged ? (
                  <button
                    aria-pressed={!stagedPatch}
                    className={
                      !stagedPatch ? CODING_DIFF_SOURCE_SELECTED_CLASS : ""
                    }
                    disabled={editingLocked}
                    onClick={() => onSetStagedPatch(false)}
                    type="button"
                  >
                    Working
                  </button>
                ) : null}
                <button
                  aria-pressed={stagedPatch}
                  className={
                    stagedPatch ? CODING_DIFF_SOURCE_SELECTED_CLASS : ""
                  }
                  disabled={editingLocked}
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
                  disabled={editingLocked}
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
                      disabled={editingLocked}
                      onClick={() => void onMutateVisiblePatch("discard-hunk")}
                      type="button"
                    >
                      Discard patch
                    </button>
                  ) : null}
                  <button
                    className="primary-button"
                    disabled={editingLocked}
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
        aria-labelledby={paneTabId(EDITOR_PANEL_ID, editorPane)}
        className={CODING_EDITOR_SURFACE_CLASS}
        id={EDITOR_PANEL_ID}
        role="tabpanel"
      >
        {editingLocked ? (
          <div className={CODING_INLINE_STATE_CLASS} role="status">
            Switching workspace. Code edits are temporarily locked.
          </div>
        ) : null}
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
                  className={`${CODING_ACTION_NOTICE_CLASS} ${codingActionNoticeTone(fileNotice.tone)}`}
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
                  disabled={editingLocked || savingFile}
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
                className={`${CODING_ACTION_NOTICE_CLASS} ${codingActionNoticeTone(fileNotice.tone)}`}
                role="status"
              >
                {fileNotice.message}
              </div>
            ) : null}
            {patchResource.data.patch.truncated ? (
              <div
                className={`${CODING_INLINE_STATE_CLASS} ${CODING_INLINE_WARN_CLASS}`}
              >
                This large patch was truncated by the runtime.
              </div>
            ) : null}
            <pre className={`${CODING_SOURCE_CLASS} ${CODING_PATCH_CLASS}`}>
              <code>
                {patchLines(patchResource.data.patch.patch).map((line) => (
                  <span
                    className={`${CODING_DIFF_LINE_CLASS} ${codingDiffLineTone(line.tone)}`}
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
          className={CODING_ACP_TASK_CLASS}
          onSubmit={(event) => void onSubmitAcpTask(event)}
        >
          <div className={CODING_ACP_TASK_ROW_CLASS}>
            <label
              className={CODING_ACP_TASK_LABEL_CLASS}
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
              disabled={editingLocked || acpEditor.promptBusy}
              id="coding-acp-task-input"
              onChange={(event) => onAcpTaskDraftChange(event.target.value)}
              placeholder="Inspect, edit, test, or explain…"
              value={acpTaskDraft}
            />
            {acpEditor.promptBusy ? (
              <button
                className="secondary-button"
                disabled={
                  editingLocked || acpEditor.promptPhase === "cancelling"
                }
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
                  editingLocked ||
                  acpEditor.phase !== "connected" ||
                  !acpTaskDraft.trim()
                }
                type="submit"
              >
                Run
              </button>
            )}
            <button
              aria-label="Close ACP editor task"
              className={`ghost-button ${CODING_ACP_TASK_CLOSE_CLASS}`}
              disabled={editingLocked}
              onClick={() => onAcpTaskOpenChange(false)}
              type="button"
            >
              ×
            </button>
          </div>
          {acpEditor.promptError ? (
            <p
              className={`${CODING_ACP_TASK_OUTPUT_CLASS} bg-[var(--bad-soft)] text-[var(--bad)]`}
              role="alert"
            >
              {acpEditor.promptError}
            </p>
          ) : acpEditor.responseText ? (
            <output className={CODING_ACP_TASK_OUTPUT_CLASS}>
              {acpEditor.responseText}
            </output>
          ) : acpEditor.promptBusy ? (
            <p
              className={`${CODING_ACP_TASK_OUTPUT_CLASS} font-[var(--font-mono)] text-[var(--muted)]`}
              role="status"
            >
              {acpEditor.lastUpdateLabel
                ? `${acpEditor.lastUpdateLabel} · ${acpEditor.updates.length} updates`
                : "Doolittle is working through ACP…"}
            </p>
          ) : acpEditor.stopReason ? (
            <p
              className={`${CODING_ACP_TASK_OUTPUT_CLASS} font-[var(--font-mono)] text-[var(--muted)]`}
              role="status"
            >
              ACP task finished · {acpEditor.stopReason}
            </p>
          ) : null}
        </form>
      ) : null}
      <footer className={CODING_EDITOR_STATUS_CLASS}>
        <span
          className={
            fileDirty
              ? "coding-modified-status text-[var(--warn)]"
              : "coding-editable-status text-[var(--accent)]"
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
          className={`${CODING_ACP_STATUS_CLASS} ${acpEditor.phase} ${
            acpEditor.phase === "connected"
              ? "text-[var(--good)]"
              : acpEditor.phase === "connecting"
                ? "text-[var(--accent)]"
                : acpEditor.phase === "degraded"
                  ? "text-[var(--bad)]"
                  : ""
          }`}
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
            className="coding-acp-progress font-[var(--font-mono)] text-[10px] tracking-[0.04em] text-[var(--muted)] uppercase"
            title={
              acpEditor.lastUpdateLabel || "Structured ACP session updates"
            }
          >
            {acpEditor.lastUpdateLabel || "ACP"} · {acpEditor.updates.length}
          </span>
        ) : null}
        {acpEditor.promptBusy && !acpTaskOpen ? (
          <button
            className={`${CODING_STATUS_ACTION_CLASS} coding-acp-cancel`}
            disabled={editingLocked}
            onClick={() => void acpEditor.cancel()}
            type="button"
          >
            Cancel ACP
          </button>
        ) : null}
        {acpEditor.phase === "degraded" ? (
          <button
            className={`${CODING_STATUS_ACTION_CLASS} coding-acp-retry`}
            disabled={editingLocked}
            onClick={() => void acpEditor.retryConnection()}
            type="button"
          >
            Retry ACP
          </button>
        ) : null}
        <span className="coding-spacer flex-1" />
        <button
          aria-expanded={acpTaskOpen}
          className={`${CODING_STATUS_ACTION_CLASS} coding-acp-task-toggle aria-expanded:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-ink)_24%,transparent)]`}
          disabled={editingLocked}
          onClick={() => onAcpTaskOpenChange(!acpTaskOpen)}
          type="button"
        >
          ACP task
        </button>
        {selectedPath ? (
          <button
            className={CODING_STATUS_ACTION_CLASS}
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
