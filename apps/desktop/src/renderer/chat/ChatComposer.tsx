import { Button as ElizaButton } from "@elizaos/ui/components/ui/button";
import { StatusBadge } from "@elizaos/ui/components/ui/status-badge";
import { Textarea as ElizaTextarea } from "@elizaos/ui/components/ui/textarea";
import type {
  Dispatch,
  FormEvent,
  KeyboardEvent,
  RefObject,
  SetStateAction,
} from "react";
import { useLayoutEffect } from "react";
import type {
  BackendState,
  CommandCatalogItem,
  ManagedAttachmentDescriptor,
  RuntimeStatus,
} from "../../shared/contracts";
import type { ChatContextCapsule } from "../chat-context-handoff";
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
import type { PersistedQueuedMessage } from "../conversation-persistence";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import type { ChatMemoryMatchState } from "./models";
import { attachmentSize, fileName, MAX_MESSAGE_ATTACHMENTS } from "./models";
import { PromptLibrary } from "./PromptLibrary";

export const CHAT_COMPOSER_MIN_HEIGHT = 54;
export const CHAT_COMPOSER_MAX_HEIGHT = 180;

/** Keep the composer readable while preventing a long draft from taking over the chat view. */
export function chatComposerHeight(scrollHeight: number): number {
  const measuredHeight = Number.isFinite(scrollHeight) ? scrollHeight : 0;
  return Math.min(
    Math.max(measuredHeight, CHAT_COMPOSER_MIN_HEIGHT),
    CHAT_COMPOSER_MAX_HEIGHT,
  );
}

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
  queuedMessages: PersistedQueuedMessage[];
  queuePaused: boolean;
  setQueuePaused: Dispatch<SetStateAction<boolean>>;
  setQueueAnnouncement: Dispatch<SetStateAction<string>>;
  clearQueuedMessages: () => void;
  removeQueuedMessage: (id: string) => void;
  attachedFiles: ManagedAttachmentDescriptor[];
  chatContextCapsule: ChatContextCapsule | null;
  removeChatContext: () => void;
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
  queuedMessages,
  queuePaused,
  setQueuePaused,
  setQueueAnnouncement,
  clearQueuedMessages,
  removeQueuedMessage,
  attachedFiles,
  chatContextCapsule,
  removeChatContext,
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: draft changes are the measurement trigger; the ref is stable and intentionally read at effect time.
  useLayoutEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;

    // Reset before measuring so deleting lines can shrink the control as well.
    textarea.style.height = "auto";
    textarea.style.height = `${chatComposerHeight(textarea.scrollHeight)}px`;
  }, [composerRef, draft]);

  const commandMenuOpen = commandSuggestions.length > 0;
  const activeCommandIndex = commandMenuOpen
    ? Math.min(commandSelection, commandSuggestions.length - 1)
    : -1;
  const activeCommandId =
    activeCommandIndex >= 0
      ? `chat-command-option-${activeCommandIndex}`
      : undefined;

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
      {chatContextCapsule ? (
        <div className="chat-context-capsule" role="status">
          <span className="chat-context-capsule__icon" aria-hidden="true">
            {chatContextCapsule.kind === "file" ? "▤" : "⌁"}
          </span>
          <span className="chat-context-capsule__label">
            {chatContextCapsule.kind === "diff" ? "Diff" : "Source"} ·{" "}
            {chatContextCapsule.path}
          </span>
          {chatContextCapsule.source ? (
            <small>{chatContextCapsule.source}</small>
          ) : null}
          <button
            aria-label={`Remove ${chatContextCapsule.path} from message context`}
            className="chat-context-capsule__remove"
            onClick={removeChatContext}
            type="button"
          >
            ×
          </button>
        </div>
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
          id="chat-command-completions"
          role="listbox"
        >
          {commandSuggestions.map((command, index) => (
            <ElizaButton
              aria-selected={index === activeCommandIndex}
              className={index === activeCommandIndex ? "selected" : ""}
              disabled={Boolean(command.disabledReason)}
              id={`chat-command-option-${index}`}
              key={command.command}
              onClick={() => selectCommandSuggestion(command)}
              role="option"
              size="sm"
              type="button"
              variant="ghost"
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
              <kbd>{index === activeCommandIndex ? "Tab" : "↑↓"}</kbd>
            </ElizaButton>
          ))}
        </div>
      ) : null}
      {draft.trimStart().startsWith("/") && commandCatalog.error ? (
        <div className="chat-command-catalog-error" role="alert">
          {commandCatalog.error}
        </div>
      ) : null}
      <div className="chat-composer-tools">
        <ElizaButton
          aria-label="Attach file context"
          className="secondary-button"
          onClick={pickContextFiles}
          size="sm"
          type="button"
          variant="secondary"
        >
          <span aria-hidden="true">＋</span>
          Attach
        </ElizaButton>
        <VoiceComposerButton
          disabled={backend.phase !== "ready"}
          importAndTranscribe={importAndTranscribeRecording}
          onTranscript={insertDictationTranscript}
        />
        <PromptLibrary
          activeProject={activeProject}
          composerRef={composerRef}
          draft={draft}
          setAnnouncement={setQueueAnnouncement}
          setDraft={setDraft}
        />
        <ComposerModelSelector
          active={backend.phase === "ready"}
          onOpenModelsPage={onOpenModelsPage}
          onOpenProvidersPage={onOpenProvidersPage}
          refreshRuntime={refreshRuntime}
          runtime={runtime}
        />
      </div>
      <ElizaTextarea
        className="chat-composer-input"
        aria-activedescendant={activeCommandId}
        aria-autocomplete="list"
        aria-controls={commandMenuOpen ? "chat-command-completions" : undefined}
        aria-haspopup="listbox"
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
        variant="default"
        density="compact"
        value={draft}
      />
      <ElizaButton
        aria-label={activeRequest ? "Queue message" : "Send message"}
        className="chat-composer-submit"
        disabled={!canSubmit}
        size="icon-sm"
        type="submit"
        variant="default"
      >
        <svg
          aria-hidden="true"
          fill="none"
          viewBox="0 0 20 20"
          stroke="currentColor"
        >
          <path d="m5 10 5-5 5 5M10 5v11" />
        </svg>
      </ElizaButton>
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
          <StatusBadge
            className="chat-status-badge"
            label={
              activeRequest
                ? "Working"
                : backend.phase === "ready"
                  ? "Ready"
                  : backend.phase
            }
            pulse={Boolean(activeRequest)}
            tone={
              activeRequest
                ? "processing"
                : backend.phase === "ready"
                  ? "success"
                  : backend.phase === "booting"
                    ? "warning"
                    : backend.phase === "degraded"
                      ? "danger"
                      : "muted"
            }
            withDot
          />
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
