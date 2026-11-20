import type { RepositoryMutationRequest } from "@doolittle/contracts/repository";
import {
  type ContextAction,
  ContextActionMenu,
  PanelTabList,
} from "@doolittle/ui";
import {
  Bot,
  FileText,
  GitCompareArrows,
  MessageSquarePlus,
  Minus,
  MoreHorizontal,
  Plus,
  Save,
  X,
} from "lucide-react";
import {
  type FormEvent,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CodeLanguage } from "../code-language";
import type { CodeEditorStateSnapshot } from "../components/CodeEditor";
import { UiIcon } from "../components/UiIcon";
import { copyContextText } from "../context-menu-clipboard";
import type {
  DesktopAcpPhase,
  DesktopAcpPromptPhase,
  DesktopAcpSessionUpdate,
} from "../desktop-acp-client";
import { type ApiResource, EmptyBlock, ErrorBlock, LoadingBlock } from "../lib";
import {
  CODING_ACP_TASK_CLASS,
  CODING_ACP_TASK_CLOSE_CLASS,
  CODING_ACP_TASK_LABEL_CLASS,
  CODING_ACP_TASK_OUTPUT_CLASS,
  CODING_ACP_TASK_ROW_CLASS,
  CODING_DIFF_LINE_CLASS,
  CODING_EDITOR_CLASS,
  CODING_EDITOR_SURFACE_CLASS,
  CODING_INLINE_STATE_CLASS,
  CODING_INLINE_WARN_CLASS,
  CODING_PANE_CLASS,
  CODING_PATCH_CLASS,
  CODING_SOURCE_CLASS,
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
import { paneTabId } from "./PaneTabs";

const EDITOR_PANEL_ID = "coding-editor-panel";
const ACP_TASK_ID = "coding-acp-task";

const EDITOR_TABS = [
  {
    id: "file",
    buttonId: paneTabId(EDITOR_PANEL_ID, "file"),
    panelId: EDITOR_PANEL_ID,
    label: (
      <>
        <UiIcon icon={FileText} size="xs" />
        <span className="@max-[450px]/code:sr-only">File</span>
      </>
    ),
  },
  {
    id: "diff",
    buttonId: paneTabId(EDITOR_PANEL_ID, "diff"),
    panelId: EDITOR_PANEL_ID,
    label: (
      <>
        <UiIcon icon={GitCompareArrows} size="xs" />
        <span className="@max-[450px]/code:sr-only">Diff</span>
      </>
    ),
  },
] as const;

const EDITOR_CONTROL_CLASS =
  "inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-xs)] border border-transparent px-1.5 font-[var(--font-sans)] text-[length:var(--text-meta)] font-medium text-[var(--text-soft)] enabled:hover:bg-[var(--surface-hover)] enabled:hover:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] disabled:opacity-45";

const ACP_STATUS_LABELS = {
  idle: "ACP idle",
  connecting: "ACP linking",
  connected: "ACP live",
  degraded: "ACP offline",
} satisfies Record<DesktopAcpPhase, string>;

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
  botId,
  originConversationId,
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
  botId?: string;
  originConversationId?: string;
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
  const documentScope = JSON.stringify([
    botId,
    originConversationId,
    workspacePath,
    selectedPath,
  ]);
  const scopeKey = JSON.stringify([documentScope, editorPane, stagedPatch]);
  const [cursor, setCursor] = useState({ scope: "", label: "" });
  const acpTaskInputRef = useRef<HTMLInputElement>(null);
  const acpTaskToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (acpTaskOpen) acpTaskInputRef.current?.focus({ preventScroll: true });
  }, [acpTaskOpen]);
  const showCursor = editorPane === "file" && cursor.scope === documentScope;
  const name = fileName(selectedPath);
  const directory = selectedPath.slice(0, -name.length).replace(/\/$/u, "");
  const fileActionsDisabled = editingLocked || !fileDirty || savingFile;
  const selectedPatch = patchResource.data?.patch;
  const canMutatePatch = Boolean(
    selectedPatch?.patch && !selectedPatch.truncated,
  );
  const patchAction = stagedPatch ? "unstage-hunk" : "stage-hunk";
  const patchActionLabel = stagedPatch ? "Unstage patch" : "Stage patch";
  const editorActions: ContextAction[] = [
    {
      id: "show-file",
      label: "Show file",
      onSelect: () => onEditorPaneChange("file"),
    },
    {
      id: "show-diff",
      label: "Show diff",
      onSelect: () => onEditorPaneChange("diff"),
    },
    {
      id: "copy-path",
      label: "Copy relative path",
      separatorBefore: true,
      disabled: !selectedPath,
      onSelect: () => copyContextText(selectedPath),
    },
  ];
  if (editorPane === "file" && selectedPath) {
    editorActions.push(
      {
        id: "save-file",
        label: savingFile ? "Saving…" : "Save file",
        shortcut: "⌘/Ctrl S",
        separatorBefore: true,
        disabled: fileActionsDisabled,
        onSelect: onSave,
      },
      {
        id: "discard-draft",
        label: "Discard unsaved edits",
        destructive: true,
        disabled: fileActionsDisabled,
        onSelect: onDiscard,
      },
    );
  }
  if (editorPane === "diff" && selectedChange) {
    if (selectedChange.staged) {
      if (selectedChange.unstaged)
        editorActions.push({
          id: "working-diff",
          label: "Show working diff",
          disabled: editingLocked,
          onSelect: () => onSetStagedPatch(false),
        });
      editorActions.push({
        id: "staged-diff",
        label: "Show staged diff",
        disabled: editingLocked,
        onSelect: () => onSetStagedPatch(true),
      });
    }
    if (canMutatePatch) {
      editorActions.push({
        id: "stage-patch",
        label: patchActionLabel,
        separatorBefore: true,
        disabled: editingLocked,
        onSelect: () => onMutateVisiblePatch(patchAction),
      });
      if (!stagedPatch && !selectedChange.untracked)
        editorActions.push({
          id: "discard-patch",
          label: "Discard patch…",
          destructive: true,
          disabled: editingLocked,
          onSelect: () => onMutateVisiblePatch("discard-hunk"),
        });
    }
  }
  return (
    <main className={`${CODING_PANE_CLASS} ${CODING_EDITOR_CLASS}`}>
      <ContextActionMenu
        className="coding-editor-toolbar flex min-h-9 min-w-0 shrink-0 items-center gap-1 border-[var(--border)] border-b bg-[var(--surface)] px-1.5"
        label="More editor actions"
        scopeKey={scopeKey}
        items={editorActions}
        trigger={
          <button
            className={EDITOR_CONTROL_CLASS}
            title="More editor actions"
            type="button"
          >
            <UiIcon icon={MoreHorizontal} size="xs" />
          </button>
        }
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-1.5 pl-1"
          title={selectedPath || undefined}
        >
          <strong className="shrink truncate font-[var(--font-mono)] text-[length:var(--text-control)] font-semibold text-[var(--text)]">
            {name || "Editor"}
          </strong>
          {fileDirty ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-[var(--warn)]"
              role="status"
            >
              <span className="sr-only">Unsaved edits</span>
            </span>
          ) : null}
          {directory ? (
            <span className="min-w-0 truncate font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)] @max-[620px]/code:hidden">
              {directory}
            </span>
          ) : null}
        </div>
        <PanelTabList
          className="shrink-0 gap-0.5 px-0.5 py-0"
          items={EDITOR_TABS}
          label="Editor views"
          onSelect={onEditorPaneChange}
          selected={editorPane}
          tabClassName={`${EDITOR_CONTROL_CLASS} aria-selected:border-[var(--border)] data-[state=active]:bg-[var(--surface-raised)] data-[state=active]:text-[var(--text)]`}
        />
        {editorPane === "file" && selectedPath ? (
          <button
            aria-keyshortcuts="Meta+S Control+S"
            aria-label={savingFile ? "Saving file" : "Save file"}
            className={EDITOR_CONTROL_CLASS}
            disabled={fileActionsDisabled}
            onClick={onSave}
            title={savingFile ? "Saving…" : "Save file (⌘/Ctrl+S)"}
            type="button"
          >
            <UiIcon icon={Save} size="xs" />
            <span className="@max-[560px]/code:hidden">
              {savingFile ? "Saving…" : "Save"}
            </span>
          </button>
        ) : editorPane === "diff" && selectedChange ? (
          <>
            {selectedChange.staged && selectedChange.unstaged ? (
              <select
                aria-label="Diff source"
                className="min-h-7 w-21 shrink-0 cursor-pointer rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface)] pl-1.5 font-[var(--font-sans)] text-[length:var(--text-meta)] text-[var(--text-soft)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] disabled:opacity-45"
                disabled={editingLocked}
                onChange={(event) =>
                  onSetStagedPatch(event.target.value === "staged")
                }
                value={stagedPatch ? "staged" : "working"}
              >
                <option value="working">Working</option>
                <option value="staged">Staged</option>
              </select>
            ) : null}
            {canMutatePatch ? (
              <button
                aria-label={patchActionLabel}
                className={EDITOR_CONTROL_CLASS}
                disabled={editingLocked}
                onClick={() => void onMutateVisiblePatch(patchAction)}
                title={patchActionLabel}
                type="button"
              >
                <UiIcon icon={stagedPatch ? Minus : Plus} size="xs" />
                <span className="@max-[560px]/code:hidden">
                  {stagedPatch ? "Unstage" : "Stage"}
                </span>
              </button>
            ) : null}
          </>
        ) : null}
      </ContextActionMenu>
      {editingLocked ? (
        <p
          className="m-0 border-[var(--border)] border-b px-2.5 py-1 text-[length:var(--text-meta)] text-[var(--muted)]"
          role="status"
        >
          Switching workspace. Editing is temporarily locked.
        </p>
      ) : null}
      {selectedPath && fileNotice ? (
        <p
          className={`m-0 border-[var(--border)] border-b px-2.5 py-1 text-[length:var(--text-meta)] text-[var(--text-soft)] ${codingActionNoticeTone(fileNotice.tone)}`}
          role={fileNotice.tone === "bad" ? "alert" : "status"}
        >
          {fileNotice.message}
        </p>
      ) : null}

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
        {!selectedPath ? (
          <EmptyBlock title="Choose a file">
            Select a workspace file or changed file to inspect it here.
          </EmptyBlock>
        ) : editorPane === "file" ? (
          fileResource.loading ? (
            <LoadingBlock label={`Opening ${name}…`} />
          ) : fileResource.error ? (
            <ErrorBlock
              error={fileResource.error}
              retry={fileResource.reload}
            />
          ) : (
            <Suspense
              fallback={<LoadingBlock label={`Loading editor ${name}…`} />}
            >
              <CodeEditor
                botId={botId}
                originConversationId={originConversationId}
                disabled={editingLocked || savingFile}
                language={selectedLanguage}
                onChange={onDraftChange}
                onEditorStateChange={(snapshot) => {
                  const label = snapshot.cursor
                    ? `Ln ${snapshot.cursor.line}, Col ${snapshot.cursor.column}`
                    : "";
                  setCursor((current) =>
                    current.scope === documentScope && current.label === label
                      ? current
                      : { scope: documentScope, label },
                  );
                  onEditorStateChange(snapshot);
                }}
                onSave={onSave}
                path={selectedPath}
                value={draftContent}
                workspacePath={workspacePath}
              />
            </Suspense>
          )
        ) : !selectedChange ? (
          <EmptyBlock title="No Git change for this file">
            Choose a changed file from the Changes pane to inspect its patch.
          </EmptyBlock>
        ) : patchResource.loading ? (
          <LoadingBlock label={`Building patch for ${name}…`} />
        ) : patchResource.error ? (
          <ErrorBlock
            error={patchResource.error}
            retry={patchResource.reload}
          />
        ) : patchResource.data?.patch?.patch ? (
          <>
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
          id={ACP_TASK_ID}
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
                {selectedPath ? `Current file · ${name}` : "Workspace context"}
              </small>
            </label>
            <input
              disabled={editingLocked || acpEditor.promptBusy}
              id="coding-acp-task-input"
              onChange={(event) => onAcpTaskDraftChange(event.target.value)}
              placeholder="Inspect, edit, test, or explain…"
              ref={acpTaskInputRef}
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
              onClick={() => {
                onAcpTaskOpenChange(false);
                acpTaskToggleRef.current?.focus({ preventScroll: true });
              }}
              type="button"
            >
              <UiIcon icon={X} size="xs" />
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
      <ContextActionMenu
        label="Editor context and agent"
        scopeKey={scopeKey}
        items={[
          {
            id: "send-context",
            label: "Ask Doolittle about this file",
            disabled: !selectedPath || editingLocked,
            onSelect: onSendSelectedContext,
          },
          {
            id: "acp-task",
            label: acpTaskOpen ? "Hide ACP task" : "Show ACP task",
            disabled: editingLocked,
            onSelect: () => onAcpTaskOpenChange(!acpTaskOpen),
          },
          {
            id: "cancel-acp",
            label: "Cancel ACP task",
            destructive: true,
            disabled: editingLocked || !acpEditor.promptBusy,
            onSelect: acpEditor.cancel,
          },
          {
            id: "retry-acp",
            label: "Retry ACP connection",
            disabled: editingLocked || acpEditor.phase !== "degraded",
            onSelect: acpEditor.retryConnection,
          },
        ]}
      >
        <footer className="coding-editor-status flex min-h-8 min-w-0 shrink-0 items-center gap-0.5 border-[var(--border)] border-t bg-[var(--surface)] px-1.5 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
          <div className="flex min-w-0 flex-1 items-center gap-2 truncate px-1">
            {showCursor && cursor.label ? (
              <span className="shrink-0 tabular-nums">{cursor.label}</span>
            ) : null}
            {editorPane === "diff" && selectedChange ? (
              <span className="truncate">{statusLabel(selectedChange)}</span>
            ) : null}
            {selectedPath && editorPane === "file" ? (
              <span className="truncate @max-[340px]/code:hidden">
                {selectedLanguage.label}
              </span>
            ) : null}
          </div>
          {acpEditor.phase !== "idle" ? (
            <span
              className={`flex shrink-0 items-center gap-1 whitespace-nowrap px-1.5 ${
                acpEditor.phase === "connected"
                  ? "text-[var(--good)]"
                  : acpEditor.phase === "degraded"
                    ? "text-[var(--bad)]"
                    : "text-[var(--muted)]"
              }`}
              title={
                acpEditor.error ||
                acpEditor.lastUpdateLabel ||
                (acpEditor.sessionId
                  ? `ACP session ${acpEditor.sessionId}`
                  : "ACP editor context")
              }
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-current"
              />
              {ACP_STATUS_LABELS[acpEditor.phase]}
            </span>
          ) : null}
          {acpEditor.promptBusy && !acpTaskOpen ? (
            <button
              className={EDITOR_CONTROL_CLASS}
              disabled={editingLocked}
              onClick={() => void acpEditor.cancel()}
              type="button"
            >
              Cancel ACP
            </button>
          ) : null}
          {acpEditor.phase === "degraded" ? (
            <button
              className={EDITOR_CONTROL_CLASS}
              disabled={editingLocked}
              onClick={() => void acpEditor.retryConnection()}
              type="button"
            >
              Retry ACP
            </button>
          ) : null}
          <button
            aria-controls={acpTaskOpen ? ACP_TASK_ID : undefined}
            aria-expanded={acpTaskOpen}
            aria-label="ACP task"
            className={`${EDITOR_CONTROL_CLASS} aria-expanded:bg-[var(--surface-hover)] aria-expanded:text-[var(--text)]`}
            disabled={editingLocked}
            onClick={() => onAcpTaskOpenChange(!acpTaskOpen)}
            ref={acpTaskToggleRef}
            title="ACP task"
            type="button"
          >
            <UiIcon icon={Bot} size="xs" />
            <span className="@max-[510px]/code:hidden">ACP task</span>
          </button>
          {selectedPath ? (
            <button
              aria-label="Ask Doolittle"
              className={EDITOR_CONTROL_CLASS}
              disabled={editingLocked}
              onClick={onSendSelectedContext}
              title="Ask Doolittle about this file"
              type="button"
            >
              <UiIcon icon={MessageSquarePlus} size="xs" />
              <span className="@max-[510px]/code:hidden">Ask Doolittle</span>
            </button>
          ) : null}
        </footer>
      </ContextActionMenu>
    </main>
  );
}
