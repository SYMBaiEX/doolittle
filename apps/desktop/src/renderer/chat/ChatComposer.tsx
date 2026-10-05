import { ComposerFrame, Button as ElizaButton } from "@doolittle/ui";
import { StatusBadge } from "@elizaos/ui/components/ui/status-badge";
import { Textarea as ElizaTextarea } from "@elizaos/ui/components/ui/textarea";
import {
  ArrowUp,
  ChevronDown,
  FileText,
  LoaderCircle,
  Paperclip,
  Plus,
  Square,
  X,
} from "lucide-react";
import type {
  CSSProperties,
  Dispatch,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  RefObject,
  SetStateAction,
} from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  BackendState,
  CommandCatalogItem,
  ManagedAttachmentDescriptor,
  RuntimeStatus,
} from "../../shared/contracts";
import { buildSkillCatalogEntries } from "../catalog-entry-models";
import type { ChatContextCapsule } from "../chat-context-handoff";
import {
  ComposerModelSelector,
  ComposerProjectSelector,
} from "../components/ComposerSelectors";
import { InlineApprovalPanel } from "../components/InlineApprovalPanel";
import { UiIcon } from "../components/UiIcon";
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
import {
  loadPromptLibrary,
  PROMPT_LIBRARY_CHANGE_EVENT,
  PROMPT_LIBRARY_STORAGE_KEY,
} from "../conversation-persistence";
import { asArray, asRecord, desktopRequest, errorMessage } from "../lib";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import { ContextCapsuleIcon } from "./ContextCapsuleIcon";
import type { ChatMemoryMatchState } from "./models";
import { attachmentSize, fileName, MAX_MESSAGE_ATTACHMENTS } from "./models";
import { PromptLibrary } from "./PromptLibrary";
import {
  type ReusableCompletion,
  reusableCompletions,
} from "./reusable-completion";

export const CHAT_COMPOSER_MIN_HEIGHT = 42;
export const CHAT_COMPOSER_MAX_HEIGHT = 156;

/** Border-box approval allowance from actual chrome, never empty-track slack. */
export function chatApprovalHeightBudget(
  paneHeight: number,
  composerHeight: number,
  approvalHeight: number,
  otherChromeHeight: number,
  transcriptReservation = 128,
): number | null {
  if (
    ![
      paneHeight,
      composerHeight,
      approvalHeight,
      otherChromeHeight,
      transcriptReservation,
    ].every((height) => Number.isFinite(height) && height >= 0) ||
    paneHeight === 0 ||
    approvalHeight === 0
  )
    return null;
  const composerControls = Math.max(0, composerHeight - approvalHeight);
  return Math.max(
    0,
    Math.min(
      280,
      Math.floor(
        paneHeight -
          otherChromeHeight -
          composerControls -
          transcriptReservation,
      ),
    ),
  );
}

/** Keep the composer readable while preventing a long draft from taking over the chat view. */
export function chatComposerHeight(scrollHeight: number): number {
  const measuredHeight = Number.isFinite(scrollHeight) ? scrollHeight : 0;
  return Math.min(
    Math.max(measuredHeight, CHAT_COMPOSER_MIN_HEIGHT),
    CHAT_COMPOSER_MAX_HEIGHT,
  );
}

export interface ChatComposerProps {
  bot?: import("@doolittle/contracts/bots").BotSummary;
  approvalsVisible?: boolean;
  workspaceNotice?: ReactNode;
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
  cancellingRequest?: string | null;
  onCancelRequest: (requestId: string) => void;
  canSubmit: boolean;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void | Promise<void>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  queueRef: RefObject<HTMLDivElement | null>;
  queuedMessages: PersistedQueuedMessage[];
  queuePaused: boolean;
  resumeQueuedMessages: () => void;
  setQueueAnnouncement: Dispatch<SetStateAction<string>>;
  clearQueuedMessages: () => void;
  removeQueuedMessage: (id: string) => void;
  attachedFiles: ManagedAttachmentDescriptor[];
  attachmentImporting: boolean;
  chatContextCapsule: ChatContextCapsule | null;
  removeChatContext: () => void;
  attachmentTotalBytes: number;
  removeContextFile: (id: string) => void;
  composerValidationError: string;
  memoryMatches: ChatMemoryMatchState;
  commandSuggestions: CommandCatalogItem[];
  commandMenuDismissed: boolean;
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
    signal: AbortSignal,
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
  bot,
  approvalsVisible = true,
  workspaceNotice,
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
  cancellingRequest = null,
  onCancelRequest,
  canSubmit,
  draft,
  setDraft,
  onSubmit,
  composerRef,
  queueRef,
  queuedMessages,
  queuePaused,
  resumeQueuedMessages,
  setQueueAnnouncement,
  clearQueuedMessages,
  removeQueuedMessage,
  attachedFiles,
  attachmentImporting,
  chatContextCapsule,
  removeChatContext,
  attachmentTotalBytes,
  removeContextFile,
  composerValidationError,
  memoryMatches,
  commandSuggestions,
  commandMenuDismissed,
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
  const formRef = useRef<HTMLFormElement>(null);
  const [approvalHeightBudget, setApprovalHeightBudget] = useState<
    number | null
  >(null);
  useLayoutEffect(() => {
    const form = formRef.current;
    const pane = form?.closest<HTMLElement>(".chat-conversation");
    const transcript = pane?.querySelector<HTMLElement>(".chat-messages");
    const transcriptRegion = pane?.querySelector<HTMLElement>(
      ".chat-transcript-region",
    );
    const dock = form?.closest<HTMLElement>(".chat-composer-dock");
    if (!form || !pane || !transcript || !transcriptRegion || !dock) return;
    const pixels = (value: string) => Number.parseFloat(value) || 0;
    const verticalChrome = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return (
        pixels(style.paddingTop) +
        pixels(style.paddingBottom) +
        pixels(style.borderTopWidth) +
        pixels(style.borderBottomWidth)
      );
    };
    const verticalMargin = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return pixels(style.marginTop) + pixels(style.marginBottom);
    };
    const measure = () => {
      const approval = form.querySelector<HTMLElement>(
        "[data-session-approval-surface]",
      );
      if (!approval) {
        setApprovalHeightBudget(null);
        return;
      }
      const noticeHeight = Array.from(transcriptRegion.children).reduce(
        (height, child) => {
          if (!(child instanceof HTMLElement) || child === transcript)
            return height;
          const style = getComputedStyle(child);
          if (
            style.position === "absolute" ||
            style.position === "fixed" ||
            style.display === "none"
          )
            return height;
          return (
            height +
            child.getBoundingClientRect().height +
            verticalMargin(child)
          );
        },
        0,
      );
      const budget = chatApprovalHeightBudget(
        pane.getBoundingClientRect().height,
        form.getBoundingClientRect().height,
        approval.getBoundingClientRect().height + verticalMargin(approval),
        verticalChrome(pane) +
          verticalChrome(transcriptRegion) +
          verticalChrome(dock) +
          verticalMargin(dock) +
          verticalMargin(form) +
          // Inline and disclosure surfaces use the same outer spacing.
          verticalMargin(approval) +
          noticeHeight,
        // Empty layout divides residual space between two equal tracks. Both
        // must fit the upper transcript's 128px plus its notices/chrome.
        pane.dataset.layout === "empty"
          ? 256 + noticeHeight + verticalChrome(transcriptRegion)
          : 128,
      );
      if (budget !== null) setApprovalHeightBudget(budget);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    observer.observe(form);
    observer.observe(transcript);
    observer.observe(transcriptRegion);
    observer.observe(dock);
    const observedNotices = new Set<HTMLElement>();
    const observeNotices = () => {
      for (const notice of observedNotices) {
        if (!transcriptRegion.contains(notice)) {
          observer.unobserve(notice);
          observedNotices.delete(notice);
        }
      }
      for (const child of transcriptRegion.children) {
        if (child instanceof HTMLElement && child !== transcript) {
          observer.observe(child);
          observedNotices.add(child);
        }
      }
    };
    observeNotices();
    const noticesObserver = new MutationObserver(() => {
      observeNotices();
      measure();
    });
    noticesObserver.observe(transcriptRegion, { childList: true });
    return () => {
      observer.disconnect();
      noticesObserver.disconnect();
    };
  }, []);
  const controlId = (name: string) => `${name}-${selectedId}`;
  const isCancellingActive = Boolean(
    activeRequest && cancellingRequest === activeRequest,
  );
  const [skills, setSkills] = useState(() => buildSkillCatalogEntries([]));
  const [skillsError, setSkillsError] = useState("");
  const [promptEntries, setPromptEntries] = useState(() =>
    typeof window === "undefined" ? [] : loadPromptLibrary(window.localStorage),
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setPromptEntries(loadPromptLibrary(localStorage));
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === PROMPT_LIBRARY_STORAGE_KEY) {
        refresh();
      }
    };
    window.addEventListener(PROMPT_LIBRARY_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refreshFromStorage);
    return () => {
      window.removeEventListener(PROMPT_LIBRARY_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refreshFromStorage);
    };
  }, []);

  useEffect(() => {
    if (backend.phase !== "ready" || !workspacePath) {
      setSkills([]);
      setSkillsError("");
      return;
    }
    let cancelled = false;
    void desktopRequest<{ skills?: unknown }>("/skills")
      .then((response) => {
        if (cancelled) return;
        setSkills(
          buildSkillCatalogEntries(asArray(response.skills).map(asRecord)),
        );
        setSkillsError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setSkills([]);
        setSkillsError(`Skills unavailable: ${errorMessage(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [backend.phase, workspacePath]);

  const reusableSuggestions = commandMenuDismissed
    ? []
    : reusableCompletions(draft, promptEntries, skills, activeProject?.id);

  // biome-ignore lint/correctness/useExhaustiveDependencies: draft changes are the measurement trigger; the ref is stable and intentionally read at effect time.
  useLayoutEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;

    // Reset before measuring so deleting lines can shrink the control as well.
    textarea.style.height = "auto";
    textarea.style.height = `${chatComposerHeight(textarea.scrollHeight)}px`;
  }, [composerRef, draft]);

  const commandMenuOpen = commandSuggestions.length > 0;
  const reusableMenuOpen = reusableSuggestions.length > 0;
  const hasMemoryMatches =
    memoryMatches.status === "ready" && memoryMatches.matches.length > 0;
  const contextSummary = selectedUsageError
    ? "Context unavailable"
    : `Context ${selectedContextPercent}%`;
  const hasContextDetails = Boolean(
    selectedUsageError ||
      (selectedContext &&
        (selectedContextTone !== "neutral" || selectedContext.overThreshold)),
  );
  const showOperationalStatus = Boolean(
    activeRequest ||
      backend.phase !== "ready" ||
      runningTasks > 0 ||
      pendingApprovals > 0,
  );
  const detailsLabel =
    hasMemoryMatches && hasContextDetails
      ? `${memoryMatches.matches.length} memory · ${contextSummary}`
      : hasMemoryMatches
        ? `${memoryMatches.matches.length} memory ${memoryMatches.matches.length === 1 ? "match" : "matches"}`
        : hasContextDetails
          ? contextSummary
          : "Details";
  const completionCount = commandMenuOpen
    ? commandSuggestions.length
    : reusableSuggestions.length;
  const activeCommandIndex =
    completionCount > 0 ? Math.min(commandSelection, completionCount - 1) : -1;
  const activeCommandId =
    activeCommandIndex >= 0
      ? controlId(
          `${commandMenuOpen ? "chat-command" : "chat-reusable"}-option-${activeCommandIndex}`,
        )
      : undefined;
  useLayoutEffect(() => {
    if (!activeCommandId) return;
    const option =
      composerRef.current?.ownerDocument.getElementById(activeCommandId);
    if (!option || !formRef.current?.contains(option)) return;
    const list = option.closest<HTMLElement>('[role="listbox"]');
    if (!list) return;
    // Scroll this bounded list only. Keyboard completions must not move the
    // transcript, composer dock, or the user's input focus.
    const bounds = list.getBoundingClientRect();
    const selected = option.getBoundingClientRect();
    if (selected.top < bounds.top) list.scrollTop -= bounds.top - selected.top;
    else if (selected.bottom > bounds.bottom)
      list.scrollTop += selected.bottom - bounds.bottom;
  }, [activeCommandId, composerRef]);
  const selectReusableSuggestion = (suggestion: ReusableCompletion) => {
    setDraft(suggestion.insertText);
    setCommandMenuDismissed(true);
    setQueueAnnouncement(
      suggestion.kind === "prompt"
        ? `Inserted “${suggestion.label}”.`
        : `Selected “${suggestion.label}”.`,
    );
    requestAnimationFrame(() => composerRef.current?.focus());
  };
  const showProjectSelector = Boolean(
    isNewConversation &&
      projects &&
      onChooseRepository &&
      onOpenProjectManager &&
      onSelectProjectForNewChat,
  );

  useEffect(() => {
    if (hasMemoryMatches || hasContextDetails) return;
    setDetailsOpen(false);
  }, [hasContextDetails, hasMemoryMatches]);
  const importContextFiles = async () => {
    if (!attachmentImporting) await pickContextFiles();
  };

  return (
    <ComposerFrame
      as="form"
      className="chat-composer"
      onSubmit={onSubmit}
      ref={formRef}
      style={
        approvalHeightBudget === null
          ? undefined
          : ({
              "--session-approval-max-height": `${approvalHeightBudget}px`,
            } as CSSProperties)
      }
    >
      {workspaceNotice}
      <InlineApprovalPanel
        active={backend.phase === "ready" && approvalsVisible}
        compact={approvalHeightBudget !== null && approvalHeightBudget < 144}
        roomId={selectedId}
      />
      {queuedMessages.length > 0 ? (
        <div className="chat-message-queue" ref={queueRef}>
          <div className="chat-message-queue-heading">
            <strong>
              {queuedMessages.length} queued{" "}
              {queuedMessages.length === 1 ? "message" : "messages"}
            </strong>
            <span>
              {queuePaused ? (
                <button onClick={resumeQueuedMessages} type="button">
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
                  <UiIcon icon={X} size="xs" />
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
              <UiIcon
                className="chat-file-context-chip__icon"
                icon={FileText}
                size="xs"
              />
              <span
                className="chat-file-context-chip__name"
                title={`${attachment.name} · ${attachment.kind} · ${attachmentSize(attachment.sizeBytes)}`}
              >
                {attachment.name}
              </span>
              <button
                aria-label={`Remove ${attachment.name} from message context`}
                className="chat-file-context-chip__remove"
                onClick={() => removeContextFile(attachment.id)}
                type="button"
              >
                <UiIcon icon={X} size="xs" />
              </button>
            </li>
          ))}
          <li className="chat-file-context-summary">
            {attachedFiles.length} / {MAX_MESSAGE_ATTACHMENTS} files ·{" "}
            {attachmentSize(attachmentTotalBytes)} / 50 MB
          </li>
        </ul>
      ) : null}
      {chatContextCapsule ? (
        <div className="chat-context-capsule" role="status">
          <span className="chat-context-capsule__icon" aria-hidden="true">
            <ContextCapsuleIcon kind={chatContextCapsule.kind} />
          </span>
          <span className="chat-context-capsule__label">
            {chatContextCapsule.kind === "diff"
              ? "Diff"
              : chatContextCapsule.kind === "review"
                ? "Review"
                : chatContextCapsule.kind === "brief"
                  ? "Brief"
                  : chatContextCapsule.kind === "plan"
                    ? "Plan"
                    : chatContextCapsule.kind === "terminal"
                      ? "Terminal"
                      : chatContextCapsule.kind === "browser"
                        ? "Browser"
                        : "Source"}{" "}
            · {chatContextCapsule.path}
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
            <UiIcon icon={X} size="xs" />
          </button>
        </div>
      ) : null}
      {composerValidationError ? (
        <div
          aria-live="polite"
          className="chat-composer-validation"
          id={controlId("chat-composer-validation")}
          role="alert"
        >
          {composerValidationError}
        </div>
      ) : null}
      {commandSuggestions.length > 0 ? (
        <div
          aria-label="Chat commands"
          className="chat-command-completions absolute inset-x-0 bottom-[calc(100%+8px)] z-50 grid max-h-[min(360px,46vh)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_98%,var(--bg))] p-1.5 shadow-[var(--shell-shadow-lg)] [@media(max-height:640px)]:static [@media(max-height:640px)]:max-h-28"
          id={controlId("chat-command-completions")}
          role="listbox"
        >
          {commandSuggestions.map((command, index) => (
            <div
              aria-disabled={command.disabledReason ? true : undefined}
              aria-selected={index === activeCommandIndex}
              className={`!grid !min-h-11 !min-w-0 grid-cols-[minmax(80px,auto)_minmax(0,1fr)_auto] items-center gap-3 !rounded-[var(--radius-sm)] !border-0 !bg-transparent px-2.5 py-2 !text-left text-[var(--text-soft)] hover:!bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-hover))] hover:!text-[var(--text)] ${index === activeCommandIndex ? "!bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-hover))] !text-[var(--text)]" : ""}`}
              id={controlId(`chat-command-option-${index}`)}
              key={command.command}
              onClick={() => {
                if (!command.disabledReason) selectCommandSuggestion(command);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                if (!command.disabledReason) selectCommandSuggestion(command);
              }}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
              tabIndex={-1}
            >
              <code className="font-[var(--font-mono)] text-[11px] text-[var(--accent)]">
                {command.command}
              </code>
              <span className="flex min-w-0 flex-col gap-0.5 [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap">
                <strong className="text-[11px] font-semibold">
                  {command.category}
                </strong>
                <small className="text-[length:var(--text-meta)] text-[var(--muted)]">
                  {command.disabledReason ?? command.description}
                </small>
                {command.aliases?.length ? (
                  <small className="text-[length:var(--text-meta)] text-[var(--faint)]">
                    Aliases: {command.aliases.join(", ")}
                  </small>
                ) : null}
              </span>
              <kbd className="text-[length:var(--text-meta)] text-[var(--muted)]">
                {index === activeCommandIndex ? "Tab" : "↑↓"}
              </kbd>
            </div>
          ))}
        </div>
      ) : null}
      {reusableSuggestions.length > 0 ? (
        <div
          aria-label="Reusable prompts and skills"
          className="chat-reusable-completions absolute inset-x-0 bottom-[calc(100%+8px)] z-50 grid max-h-[min(360px,46vh)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_98%,var(--bg))] p-1.5 shadow-[var(--shell-shadow-lg)] [@media(max-height:640px)]:static [@media(max-height:640px)]:max-h-28"
          id={controlId("chat-reusable-completions")}
          role="listbox"
        >
          <div className="flex items-center justify-between gap-3 px-2.5 py-1.5 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
            <span>Reusable prompts &amp; skills</span>
            <kbd>$</kbd>
          </div>
          {reusableSuggestions.map((suggestion, index) => (
            <div
              aria-selected={index === activeCommandIndex}
              className={`!grid !min-h-11 !min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 !rounded-[var(--radius-sm)] !border-0 !bg-transparent px-2.5 py-2 !text-left text-[var(--text-soft)] hover:!bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-hover))] hover:!text-[var(--text)] ${index === activeCommandIndex ? "!bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-hover))] !text-[var(--text)]" : ""}`}
              id={controlId(`chat-reusable-option-${index}`)}
              key={suggestion.id}
              onClick={() => selectReusableSuggestion(suggestion)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                selectReusableSuggestion(suggestion);
              }}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
              tabIndex={-1}
            >
              <span className="flex min-w-0 flex-col gap-0.5 [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap">
                <strong className="text-[11px] font-semibold text-[var(--text)]">
                  {suggestion.label}
                </strong>
                <small className="text-[length:var(--text-meta)] text-[var(--muted)]">
                  {suggestion.description}
                </small>
              </span>
              <small className="rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] px-1.5 py-0.5 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--accent)]">
                {suggestion.scope}
              </small>
            </div>
          ))}
        </div>
      ) : null}
      {draft.trimStart().startsWith("/") && commandCatalog.error ? (
        <div className="chat-command-catalog-error" role="alert">
          {commandCatalog.error}
        </div>
      ) : null}
      {draft.trimStart().startsWith("$") && skillsError ? (
        <div className="chat-command-catalog-error" role="alert">
          {skillsError}
        </div>
      ) : null}
      <div className="chat-composer-main">
        <ElizaTextarea
          className="chat-composer-input !max-h-[156px] !min-h-[46px] !w-full !resize-none !rounded-[var(--radius-xs)] !border-0 !bg-transparent px-1 py-1 text-[14px] leading-[1.5] text-[var(--text)] [box-shadow:none]! placeholder:text-[var(--faint)] focus-visible:!outline-2 focus-visible:!outline-solid focus-visible:!outline-offset-0 focus-visible:!outline-[var(--text-soft)] max-[720px]:!max-h-[132px] max-[480px]:!max-h-[112px] max-[480px]:!min-h-10 max-[480px]:!px-0.5 max-[480px]:!py-0.5 max-[480px]:text-[14px]"
          aria-activedescendant={activeCommandId}
          aria-autocomplete="list"
          aria-describedby={
            composerValidationError
              ? controlId("chat-composer-validation")
              : undefined
          }
          aria-controls={
            commandMenuOpen
              ? controlId("chat-command-completions")
              : reusableMenuOpen
                ? controlId("chat-reusable-completions")
                : undefined
          }
          aria-errormessage={
            composerValidationError
              ? controlId("chat-composer-validation")
              : undefined
          }
          aria-expanded={commandMenuOpen || reusableMenuOpen}
          aria-haspopup="listbox"
          aria-invalid={composerValidationError ? true : undefined}
          aria-label="Message Doolittle"
          id={controlId("chat-composer-input")}
          disabled={backend.phase !== "ready"}
          onChange={(event) => {
            setDraft(event.target.value);
            setCommandMenuDismissed(false);
            setCommandSelection(0);
          }}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.nativeEvent.isComposing) return;
            if (completionCount > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCommandSelection((current) =>
                  Math.min(current + 1, completionCount - 1),
                );
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setCommandSelection((current) => Math.max(current - 1, 0));
                return;
              }
              if (
                event.key === "Tab" ||
                (event.key === "Enter" && reusableMenuOpen)
              ) {
                event.preventDefault();
                const selection = Math.min(
                  commandSelection,
                  completionCount - 1,
                );
                if (commandMenuOpen) {
                  const selected = commandSuggestions[selection];
                  if (selected) selectCommandSuggestion(selected);
                } else {
                  const selected = reusableSuggestions[selection];
                  if (selected) selectReusableSuggestion(selected);
                }
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setCommandMenuDismissed(true);
                return;
              }
            }
            if (
              event.key === "Escape" &&
              activeRequest &&
              !isCancellingActive
            ) {
              event.preventDefault();
              onCancelRequest(activeRequest);
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!isCancellingActive) void onSubmit();
            }
          }}
          placeholder={
            backend.phase === "ready"
              ? activeProject
                ? `Message ${activeProject.name}…`
                : `Message ${bot?.name ?? "Doolittle"}…`
              : "Waiting for the local runtime…"
          }
          ref={composerRef}
          rows={1}
          variant="default"
          density="compact"
          value={draft}
        />
      </div>
      <div className="chat-composer-footer">
        <div className="chat-composer-tools flex items-center gap-1.5">
          <ElizaButton
            aria-label="Attach multiple files"
            aria-busy={attachmentImporting || undefined}
            className="!size-10 !min-h-10 !min-w-10 !justify-center rounded-[var(--radius-md)] !border-transparent !bg-transparent !p-0 text-[var(--text-soft)] hover:!border-[var(--border)] hover:!bg-[var(--surface-soft)] hover:!text-[var(--text)] max-[720px]:!size-11 max-[720px]:!min-h-11 max-[720px]:!min-w-11"
            disabled={attachmentImporting}
            onClick={() => void importContextFiles()}
            size="sm"
            title={attachmentImporting ? "Importing files" : "Attach files"}
            type="button"
            variant="secondary"
          >
            <UiIcon icon={Paperclip} size="xs" />
            <span className="sr-only">
              {attachmentImporting
                ? "Importing files"
                : attachedFiles.length > 0
                  ? "Add files"
                  : "Attach files"}
            </span>
          </ElizaButton>
          <span aria-live="polite" className="sr-only" role="status">
            {attachmentImporting ? "Importing file context…" : ""}
          </span>
          <details
            className="relative"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary
              aria-label="More composer tools"
              className="grid size-10 cursor-pointer list-none place-items-center rounded-[var(--radius-md)] text-[var(--text-soft)] hover:bg-[var(--surface-hover)] max-[720px]:size-11"
            >
              <UiIcon icon={Plus} size="sm" />
            </summary>
            <div className="chat-composer-tool-menu absolute bottom-full left-0 z-30 mb-2 flex min-w-52 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-[var(--shell-shadow-md)] [@media(max-height:640px)]:static [@media(max-height:640px)]:my-2 [@media(max-height:640px)]:min-w-0 [@media(max-height:640px)]:flex-wrap">
              <VoiceComposerButton
                disabled={backend.phase !== "ready"}
                importAndTranscribe={importAndTranscribeRecording}
                onTranscript={insertDictationTranscript}
              />
              <PromptLibrary
                namespace={selectedId}
                activeProject={activeProject}
                composerRef={composerRef}
                draft={draft}
                setAnnouncement={setQueueAnnouncement}
                setDraft={setDraft}
              />
            </div>
          </details>
        </div>
        <div className="chat-composer-footer-right">
          <div
            className="chat-composer-routing flex items-center justify-end gap-1.5"
            data-has-project={showProjectSelector ? "true" : undefined}
          >
            {showProjectSelector &&
            projects &&
            onChooseRepository &&
            onOpenProjectManager &&
            onSelectProjectForNewChat ? (
              <ComposerProjectSelector
                activeProjectId={activeProject?.id}
                onChooseRepository={onChooseRepository}
                onManageProjects={onOpenProjectManager}
                onSelectProject={onSelectProjectForNewChat}
                projects={projects}
              />
            ) : null}
            <ComposerModelSelector
              bot={bot && !bot.isDefault ? bot : undefined}
              active={backend.phase === "ready"}
              onOpenModelsPage={onOpenModelsPage}
              onOpenProvidersPage={onOpenProvidersPage}
              refreshRuntime={refreshRuntime}
              runtime={runtime}
            />
          </div>
          {showOperationalStatus ? (
            <div className="chat-composer-status">
              <StatusBadge
                className="chat-status-badge !inline-flex !min-h-[18px] items-center !border-0 !bg-transparent px-[5px] py-px !font-[inherit] !text-[length:var(--text-meta)] !tracking-normal !text-[var(--text-soft)] normal-case"
                label={
                  isCancellingActive
                    ? "Stopping"
                    : activeRequest
                      ? "Working"
                      : backend.phase
                }
                pulse={Boolean(activeRequest)}
                tone={
                  activeRequest
                    ? "processing"
                    : backend.phase === "booting"
                      ? "warning"
                      : backend.phase === "degraded"
                        ? "danger"
                        : "muted"
                }
                withDot
              />
              {runningTasks > 0 ? (
                <small>
                  {runningTasks} runtime task{runningTasks === 1 ? "" : "s"}{" "}
                  active
                </small>
              ) : null}
              {pendingApprovals > 0 ? (
                <small className="warning">
                  {pendingApprovals} runtime approval
                  {pendingApprovals === 1 ? "" : "s"}
                </small>
              ) : null}
            </div>
          ) : null}
          {hasMemoryMatches || hasContextDetails ? (
            <ElizaButton
              aria-controls={controlId("chat-composer-details")}
              aria-label={detailsLabel}
              aria-expanded={detailsOpen}
              className="chat-composer-meta-toggle !min-h-10 rounded-[var(--radius-md)] !border-transparent !bg-transparent px-2 py-1 text-[length:var(--text-control)] text-[var(--text-soft)] hover:!border-[var(--border)] hover:!bg-[var(--surface-soft)] hover:!text-[var(--text)] max-[720px]:!min-h-11"
              onClick={() => setDetailsOpen((current) => !current)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <span className="chat-composer-meta-toggle__label">
                {detailsLabel}
              </span>
              <UiIcon
                className={detailsOpen ? "rotate-180" : undefined}
                icon={ChevronDown}
                size="xs"
              />
            </ElizaButton>
          ) : null}
          <ElizaButton
            aria-label={
              isCancellingActive
                ? "Stopping response"
                : activeRequest
                  ? "Stop response"
                  : "Send message"
            }
            aria-keyshortcuts={activeRequest ? "Escape" : undefined}
            className={`chat-composer-submit !size-10 !min-h-10 !min-w-10 !rounded-[var(--radius-md)] !p-0 motion-reduce:transition-none max-[720px]:!size-11 max-[720px]:!min-h-11 max-[720px]:!min-w-11 ${
              activeRequest
                ? "!border !border-[color-mix(in_srgb,var(--bad)_40%,var(--border))] !bg-[color-mix(in_srgb,var(--bad)_10%,var(--surface-soft))] !text-[var(--bad)] hover:!bg-[color-mix(in_srgb,var(--bad)_18%,var(--surface-hover))]"
                : "!border-0 !bg-[var(--accent)] !text-[var(--accent-ink)] hover:!bg-[color-mix(in_srgb,var(--accent)_86%,var(--text))] disabled:!bg-[var(--surface-soft)] disabled:!text-[var(--faint)] disabled:opacity-70"
            }`}
            disabled={isCancellingActive || (!activeRequest && !canSubmit)}
            onClick={
              activeRequest && !isCancellingActive
                ? () => onCancelRequest(activeRequest)
                : undefined
            }
            size="icon-sm"
            title={
              isCancellingActive
                ? "Stopping the current response…"
                : activeRequest
                  ? "Stop the current response (Escape)"
                  : "Send message (Enter)"
            }
            type={activeRequest ? "button" : "submit"}
            variant="default"
          >
            <UiIcon
              className={
                isCancellingActive
                  ? "animate-spin motion-reduce:animate-none"
                  : undefined
              }
              icon={
                isCancellingActive
                  ? LoaderCircle
                  : activeRequest
                    ? Square
                    : ArrowUp
              }
              size="sm"
            />
          </ElizaButton>
        </div>
      </div>
      <small className="chat-composer-hint">
        {isCancellingActive
          ? "Stopping response"
          : activeRequest
            ? "Enter to queue"
            : "Enter to send"}{" "}
        · Shift Enter for a new line
      </small>
      {detailsOpen && (hasMemoryMatches || hasContextDetails) ? (
        <div
          className="chat-composer-details"
          id={controlId("chat-composer-details")}
        >
          {hasMemoryMatches ? (
            <section
              aria-label={`${memoryMatches.matches.length} saved profile matches`}
              className="chat-memory-matches"
              data-status="ready"
            >
              <strong>
                Memory matches <span>· saved profile</span>
              </strong>
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
            </section>
          ) : null}
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
            <span className="chat-status-runtime flex min-w-0 items-center gap-1.5 whitespace-nowrap font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)] [&_small]:max-w-[170px] [&_small]:overflow-hidden [&_small]:text-ellipsis">
              <small>Runtime</small>
              <small>{modelRouteLabel}</small>
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
        </div>
      ) : null}
    </ComposerFrame>
  );
}
