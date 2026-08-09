import type {
  Dispatch,
  FormEvent,
  KeyboardEvent,
  RefObject,
  SetStateAction,
} from "react";
import type {
  BackendState,
  CommandCatalogItem,
  ManagedAttachmentDescriptor,
  RuntimeStatus,
} from "../../shared/contracts";
import {
  ComposerModelSelector,
  ComposerProjectSelector,
} from "../components/ComposerSelectors";
import { InlineApprovalPanel } from "../components/InlineApprovalPanel";
import {
  VoiceComposerButton,
  type VoiceRecorderMime,
} from "../components/VoiceComposerButton";
import type {
  ContextPressureSnapshot,
  ContextPressureTone,
} from "../context-pressure";
import { contextPressureLabel } from "../context-pressure";
import type {
  PersistedQueuedMessage,
  PromptLibraryEntry,
} from "../conversation-persistence";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import type { ChatMemoryMatchState } from "./models";
import { attachmentSize, fileName, MAX_MESSAGE_ATTACHMENTS } from "./models";

export interface ChatComposerProps {
  activeProject?: {
    id: string;
    name: string;
    color?: string | null;
    primaryPath?: string | null;
  } | null;
  projects?: readonly ProjectLike[];
  onChooseRepository?: () => void | Promise<void>;
  onOpenProjectManager?: () => void;
  onSelectProjectForNewChat?: (scope: ProjectScope) => void;
  isNewConversation: boolean;
  backend: BackendState;
  runtime: RuntimeStatus | null;
  refreshRuntime: () => void;
  onOpenModelsPage: () => void;
  onOpenProvidersPage: () => void;
  activeRequest: string | null;
  canSubmit: boolean;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void | Promise<void>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  queueRef: RefObject<HTMLDivElement | null>;
  promptRenameRef: RefObject<HTMLInputElement | null>;
  queuedMessages: PersistedQueuedMessage[];
  queuePaused: boolean;
  setQueuePaused: Dispatch<SetStateAction<boolean>>;
  setQueueAnnouncement: Dispatch<SetStateAction<string>>;
  clearQueuedMessages: () => void;
  removeQueuedMessage: (id: string) => void;
  attachedFiles: ManagedAttachmentDescriptor[];
  attachmentTotalBytes: number;
  removeContextFile: (id: string) => void;
  composerValidationError: string;
  memoryMatches: ChatMemoryMatchState;
  commandSuggestions: CommandCatalogItem[];
  commandSelection: number;
  setCommandSelection: Dispatch<SetStateAction<number>>;
  setCommandMenuDismissed: Dispatch<SetStateAction<boolean>>;
  selectCommandSuggestion: (command: CommandCatalogItem) => void;
  commandCatalog: { commands: CommandCatalogItem[]; error: string };
  pickContextFiles: () => void | Promise<void>;
  importAndTranscribeRecording: (
    bytes: Uint8Array,
    mimeType: VoiceRecorderMime,
    name: string,
  ) => Promise<{ transcriptText: string }>;
  insertDictationTranscript: (transcript: string) => void;
  promptLibraryOpen: boolean;
  setPromptLibraryOpen: Dispatch<SetStateAction<boolean>>;
  visiblePromptLibrary: PromptLibraryEntry[];
  promptScope: "general" | "project";
  setPromptScope: Dispatch<SetStateAction<"general" | "project">>;
  promptTitle: string;
  setPromptTitle: Dispatch<SetStateAction<string>>;
  saveCurrentPrompt: () => void;
  editingPromptId: string;
  editingPromptTitle: string;
  setEditingPromptId: Dispatch<SetStateAction<string>>;
  setEditingPromptTitle: Dispatch<SetStateAction<string>>;
  finishPromptRename: () => void;
  restorePrompt: (entry: PromptLibraryEntry) => void;
  deletePrompt: (entry: PromptLibraryEntry) => void;
  beginPromptRename: (entry: PromptLibraryEntry) => void;
  selectedContext?: ContextPressureSnapshot;
  selectedContextPercent: number;
  selectedContextTone: ContextPressureTone;
  selectedUsageError?: string;
  usageLoading: string;
  selectedId: string;
  modelRouteLabel: string;
  workspacePath: string;
  pendingApprovals: number;
  runningTasks: number;
}

export function ChatComposer({
  activeProject,
  projects,
  onChooseRepository,
  onOpenProjectManager,
  onSelectProjectForNewChat,
  isNewConversation,
  backend,
  runtime,
  refreshRuntime,
  onOpenModelsPage,
  onOpenProvidersPage,
  activeRequest,
  canSubmit,
  draft,
  setDraft,
  onSubmit,
  composerRef,
  queueRef,
  promptRenameRef,
  queuedMessages,
  queuePaused,
  setQueuePaused,
  setQueueAnnouncement,
  clearQueuedMessages,
  removeQueuedMessage,
  attachedFiles,
  attachmentTotalBytes,
  removeContextFile,
  composerValidationError,
  memoryMatches,
  commandSuggestions,
  commandSelection,
  setCommandSelection,
  setCommandMenuDismissed,
  selectCommandSuggestion,
  commandCatalog,
  pickContextFiles,
  importAndTranscribeRecording,
  insertDictationTranscript,
  promptLibraryOpen,
  setPromptLibraryOpen,
  visiblePromptLibrary,
  promptScope,
  setPromptScope,
  promptTitle,
  setPromptTitle,
  saveCurrentPrompt,
  editingPromptId,
  editingPromptTitle,
  setEditingPromptId,
  setEditingPromptTitle,
  finishPromptRename,
  restorePrompt,
  deletePrompt,
  beginPromptRename,
  selectedContext,
  selectedContextPercent,
  selectedContextTone,
  selectedUsageError,
  usageLoading,
  selectedId,
  modelRouteLabel,
  workspacePath,
  pendingApprovals,
  runningTasks,
}: ChatComposerProps) {
  return (
    <form className="chat-composer" onSubmit={onSubmit}>
      {isNewConversation &&
      projects &&
      onChooseRepository &&
      onOpenProjectManager &&
      onSelectProjectForNewChat ? (
        <div className="chat-composer-context-tab">
          <ComposerProjectSelector
            activeProjectId={activeProject?.id}
            onChooseRepository={onChooseRepository}
            onManageProjects={onOpenProjectManager}
            onSelectProject={onSelectProjectForNewChat}
            projects={projects}
          />
        </div>
      ) : null}
      <InlineApprovalPanel active={backend.phase === "ready"} />
      {queuedMessages.length > 0 ? (
        <div className="chat-message-queue" ref={queueRef}>
          <div className="chat-message-queue-heading">
            <strong>
              {queuedMessages.length} queued{" "}
              {queuedMessages.length === 1 ? "message" : "messages"}
            </strong>
            <span>
              {queuePaused ? (
                <button
                  onClick={() => {
                    setQueuePaused(false);
                    setQueueAnnouncement(
                      "Recovered queue resumed. The next message will send when Doolittle is ready.",
                    );
                  }}
                  type="button"
                >
                  Resume queue
                </button>
              ) : null}
              <button onClick={clearQueuedMessages} type="button">
                Clear queue
              </button>
            </span>
          </div>
          <ol aria-label="Queued messages">
            {queuedMessages.map((message, index) => (
              <li key={message.id}>
                <span>{index + 1}</span>
                <p title={message.content}>{message.content}</p>
                {message.attachments.length > 0 ? (
                  <small>{message.attachments.length} files</small>
                ) : null}
                <button
                  aria-label={`Remove queued message ${index + 1}`}
                  data-queue-remove
                  onClick={() => removeQueuedMessage(message.id)}
                  type="button"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {attachedFiles.length > 0 ? (
        <ul
          aria-label="Selected local context files"
          className="chat-file-context-list"
        >
          {attachedFiles.map((attachment) => (
            <li className="chat-file-context-chip" key={attachment.id}>
              <span
                className="chat-file-context-chip__name"
                title={`${attachment.kind} · ${attachmentSize(attachment.sizeBytes)}`}
              >
                {attachment.name}
              </span>
              <button
                aria-label={`Remove ${attachment.name} from message context`}
                className="chat-file-context-chip__remove"
                onClick={() => removeContextFile(attachment.id)}
                type="button"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {attachedFiles.length > 0 ? (
        <div className="chat-attachment-summary">
          {attachedFiles.length} / {MAX_MESSAGE_ATTACHMENTS} files ·{" "}
          {attachmentSize(attachmentTotalBytes)} / 50 MB
        </div>
      ) : null}
      {composerValidationError ? (
        <div
          aria-live="polite"
          className="chat-composer-validation"
          role="alert"
        >
          {composerValidationError}
        </div>
      ) : null}
      {memoryMatches.status === "loading" ? (
        <div
          aria-live="polite"
          className="chat-memory-matches"
          data-status="loading"
        >
          <span>Checking saved profile matches…</span>
        </div>
      ) : null}
      {memoryMatches.status === "ready" ? (
        <section
          aria-label={`${memoryMatches.matches.length} saved profile matches`}
          className="chat-memory-matches"
          data-status="ready"
        >
          <strong>
            Memory matches <span>· saved profile</span>
          </strong>
          {memoryMatches.matches.length ? (
            <ul>
              {memoryMatches.matches.map((match) => (
                <li key={`${match.kind}:${match.value}`}>
                  <small className="chat-memory-matches__kind">
                    {match.kind}
                  </small>
                  <span title={match.value}>{match.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span>No saved profile matches for this draft.</span>
          )}
        </section>
      ) : null}
      {memoryMatches.status === "error" ? (
        <div className="chat-memory-matches" data-status="error">
          <span>Saved profile matches are unavailable for this draft.</span>
        </div>
      ) : null}
      {commandSuggestions.length > 0 ? (
        <div
          aria-label="Chat commands"
          className="chat-command-completions"
          role="listbox"
        >
          {commandSuggestions.map((command, index) => (
            <button
              aria-selected={index === commandSelection}
              className={index === commandSelection ? "selected" : ""}
              disabled={Boolean(command.disabledReason)}
              key={command.command}
              onClick={() => selectCommandSuggestion(command)}
              role="option"
              type="button"
            >
              <code>{command.command}</code>
              <span>
                <strong>{command.category}</strong>
                <small>{command.disabledReason ?? command.description}</small>
                {command.aliases?.length ? (
                  <small className="chat-command-completions__aliases">
                    Aliases: {command.aliases.join(", ")}
                  </small>
                ) : null}
              </span>
              <kbd>{index === commandSelection ? "Tab" : "↑↓"}</kbd>
            </button>
          ))}
        </div>
      ) : null}
      {draft.trimStart().startsWith("/") && commandCatalog.error ? (
        <div className="chat-command-catalog-error" role="alert">
          {commandCatalog.error}
        </div>
      ) : null}
      <div className="chat-composer-tools">
        <button
          aria-label="Attach file context"
          className="secondary-button"
          onClick={pickContextFiles}
          type="button"
        >
          <span aria-hidden="true">＋</span>
          Attach
        </button>
        <VoiceComposerButton
          disabled={backend.phase !== "ready"}
          importAndTranscribe={importAndTranscribeRecording}
          onTranscript={insertDictationTranscript}
        />
        <button
          aria-controls="chat-prompt-library"
          aria-expanded={promptLibraryOpen}
          className="secondary-button"
          onClick={() => setPromptLibraryOpen((current) => !current)}
          type="button"
        >
          Prompts
          {visiblePromptLibrary.length > 0
            ? ` · ${visiblePromptLibrary.length}`
            : ""}
        </button>
        {promptLibraryOpen ? (
          <section
            aria-label="Prompt library"
            className="chat-prompt-library"
            id="chat-prompt-library"
          >
            <header>
              <div className="chat-prompt-library__heading">
                <strong>Prompt library</strong>
                <small>
                  {activeProject && promptScope === "project"
                    ? activeProject.name
                    : "General"}
                </small>
              </div>
              <button
                aria-label="Close prompt library"
                onClick={() => setPromptLibraryOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            {activeProject ? (
              <fieldset
                aria-label="Prompt library scope"
                className="chat-prompt-library__scope"
              >
                <legend className="sr-only">Prompt library scope</legend>
                <button
                  aria-pressed={promptScope === "project"}
                  onClick={() => setPromptScope("project")}
                  type="button"
                >
                  {activeProject.name}
                </button>
                <button
                  aria-pressed={promptScope === "general"}
                  onClick={() => setPromptScope("general")}
                  type="button"
                >
                  General
                </button>
              </fieldset>
            ) : null}
            <div className="chat-prompt-library__save">
              <input
                aria-label="Saved prompt title"
                maxLength={80}
                onChange={(event) => setPromptTitle(event.target.value)}
                placeholder="Title (optional)"
                value={promptTitle}
              />
              <button
                disabled={!draft.trim()}
                onClick={saveCurrentPrompt}
                type="button"
              >
                Save draft
              </button>
            </div>
            {visiblePromptLibrary.length > 0 ? (
              <ul>
                {visiblePromptLibrary.map((entry) => (
                  <li key={entry.id}>
                    {editingPromptId === entry.id ? (
                      <input
                        aria-label={`Rename ${entry.title}`}
                        maxLength={80}
                        onBlur={finishPromptRename}
                        onChange={(event) =>
                          setEditingPromptTitle(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            finishPromptRename();
                          } else if (event.key === "Escape") {
                            setEditingPromptId("");
                            setEditingPromptTitle("");
                          }
                        }}
                        ref={promptRenameRef}
                        value={editingPromptTitle}
                      />
                    ) : (
                      <button
                        className="chat-prompt-library__restore"
                        onClick={() => restorePrompt(entry)}
                        title={entry.content}
                        type="button"
                      >
                        <strong>{entry.title}</strong>
                        <small>{entry.content}</small>
                      </button>
                    )}
                    <span>
                      <button
                        aria-label={`Rename ${entry.title}`}
                        onClick={() => beginPromptRename(entry)}
                        type="button"
                      >
                        Rename
                      </button>
                      <button
                        aria-label={`Delete ${entry.title}`}
                        onClick={() => deletePrompt(entry)}
                        type="button"
                      >
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No saved prompts in this scope. Write a draft and save it here
                for reuse.
              </p>
            )}
          </section>
        ) : null}
        <ComposerModelSelector
          active={backend.phase === "ready"}
          onOpenModelsPage={onOpenModelsPage}
          onOpenProvidersPage={onOpenProvidersPage}
          refreshRuntime={refreshRuntime}
          runtime={runtime}
        />
      </div>
      <textarea
        aria-label="Message Doolittle"
        disabled={backend.phase !== "ready"}
        onChange={(event) => {
          setDraft(event.target.value);
          setCommandMenuDismissed(false);
          setCommandSelection(0);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.nativeEvent.isComposing) return;
          if (commandSuggestions.length > 0) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCommandSelection((current) =>
                Math.min(current + 1, commandSuggestions.length - 1),
              );
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setCommandSelection((current) => Math.max(current - 1, 0));
              return;
            }
            if (event.key === "Tab") {
              event.preventDefault();
              const selected =
                commandSuggestions[
                  Math.min(commandSelection, commandSuggestions.length - 1)
                ];
              if (selected) selectCommandSuggestion(selected);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setCommandMenuDismissed(true);
              return;
            }
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void onSubmit();
          }
        }}
        placeholder={
          backend.phase === "ready"
            ? activeProject
              ? `Message ${activeProject.name}…`
              : "Message Doolittle…"
            : "Waiting for the local runtime…"
        }
        ref={composerRef}
        rows={1}
        value={draft}
      />
      <button
        aria-label={activeRequest ? "Queue message" : "Send message"}
        disabled={!canSubmit}
        type="submit"
      >
        <svg
          aria-hidden="true"
          fill="none"
          viewBox="0 0 20 20"
          stroke="currentColor"
        >
          <path d="m5 10 5-5 5 5M10 5v11" />
        </svg>
      </button>
      <small className="chat-composer-hint">
        {activeRequest ? "Enter to queue" : "Enter to send"} · Shift Enter for a
        new line
      </small>
      <div
        aria-label={
          selectedContext
            ? `Estimated context usage ${Math.round(
                selectedContextPercent,
              )} percent`
            : "Estimated context usage unavailable"
        }
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={
          selectedContext ? Math.round(selectedContextPercent) : undefined
        }
        className={`chat-context-meter ${selectedContextTone}`}
        role="progressbar"
        title={
          selectedContext
            ? `Estimated for ${selectedContext.provider ?? runtime?.provider ?? "current provider"} · ${
                selectedContext.model ?? runtime?.model ?? "current model"
              }`
            : selectedUsageError
        }
      >
        <span className="chat-status-runtime">
          <i className={backend.phase} aria-hidden="true" />
          <strong>
            {activeRequest
              ? "Working"
              : backend.phase === "ready"
                ? "Ready"
                : backend.phase}
          </strong>
          <small>{modelRouteLabel}</small>
          {runningTasks > 0 ? <small>{runningTasks} active</small> : null}
          {pendingApprovals > 0 ? (
            <small className="warning">
              {pendingApprovals} approval
              {pendingApprovals === 1 ? "" : "s"}
            </small>
          ) : null}
        </span>
        <span className="chat-context-track" aria-hidden="true">
          <i
            className="chat-context-fill"
            style={{ width: `${selectedContextPercent}%` }}
          />
        </span>
        <span>
          <strong>Context</strong>
          <small>
            {selectedContext
              ? `${contextPressureLabel(selectedContext)} · ${fileName(
                  workspacePath,
                )}`
              : usageLoading === selectedId
                ? "Measuring…"
                : selectedUsageError
                  ? "Unavailable"
                  : `0% · ${fileName(workspacePath)}`}
          </small>
        </span>
      </div>
    </form>
  );
}
