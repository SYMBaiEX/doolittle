import { ComposerFrame, Button as ElizaButton } from "@doolittle/ui";
import { useVisibleInterval } from "@doolittle/ui/environment";
import { StatusBadge } from "@elizaos/ui/components/ui/status-badge";
import { Textarea as ElizaTextarea } from "@elizaos/ui/components/ui/textarea";
import {
  ArrowUp,
  CircleGauge,
  Ellipsis,
  FileText,
  ListEnd,
  LoaderCircle,
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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { InlineInputRequestPanel } from "../components/InlineInputRequestPanel";
import { UiIcon } from "../components/UiIcon";
import {
  VoiceComposerButton,
  type VoiceRecorderMime,
} from "../components/VoiceComposerButton";
import type { ChatWorkspaceTarget } from "../composer-selectors/ComposerProjectSelector";
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
import { asArray, asRecord, useApiResource } from "../lib";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import { ContextCapsuleIcon, contextCapsuleLabel } from "./ContextCapsuleIcon";
import type { ChatMemoryMatchState } from "./models";
import { attachmentSize, fileName, MAX_MESSAGE_ATTACHMENTS } from "./models";
import { PromptLibrary } from "./PromptLibrary";
import {
  type ReusableCompletion,
  reusableCompletions,
} from "./reusable-completion";

import { pendingApprovalsForSession } from "./session-approvals";
import { pendingInputRequestsForSession } from "./session-input-requests";
import "./composer-design.css";

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

export type { ChatWorkspaceTarget };

export interface ChatComposerProps {
  bot?: import("@doolittle/contracts/bots").BotSummary;
  approvalBotId: string;
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
  workspaceTarget?: ChatWorkspaceTarget;
  /** Bound chats keep their host-confirmed workspace; the picker is for new chats. */
  workspaceBound?: boolean;
  backend: BackendState;
  runtime: RuntimeStatus | null;
  refreshRuntime: () => void;
  onOpenModelsPage: () => void;
  onOpenProvidersPage: () => void;
  activeRequest: string | null;
  cancellingRequest?: string | null;
  onCancelRequest: (requestId: string) => void;
  canSubmit: boolean;
  canQueue: boolean;
  /** Drafts are editable while a local runtime or selected agent warms up. */
  canDraft?: boolean;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void | Promise<void>;
  /** Sends a selector-submitted answer as the user's next message. */
  onSendAnswers?: (text: string) => boolean | Promise<boolean>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  queueRef: RefObject<HTMLDivElement | null>;
  queuedMessages: PersistedQueuedMessage[];
  queueDispatchingId: string | null;
  queuePaused: boolean;
  queueStatus?: string;
  onOpenQueueHead?: () => void;
  resumeQueuedMessages: () => void;
  setQueueAnnouncement: Dispatch<SetStateAction<string>>;
  clearQueuedMessages: () => void;
  removeQueuedMessage: (id: string) => void;
  attachedFiles: ManagedAttachmentDescriptor[];
  attachmentImporting: boolean;
  attachmentNotice: string;
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
  runningTasks: number;
}

export function ChatComposer({
  bot,
  approvalBotId,
  approvalsVisible = true,
  workspaceNotice,
  activeProject,
  projects,
  onChooseRepository,
  onOpenProjectManager,
  onSelectProjectForNewChat,
  workspaceTarget,
  workspaceBound = false,
  backend,
  runtime,
  refreshRuntime,
  onOpenModelsPage,
  onOpenProvidersPage,
  activeRequest,
  cancellingRequest = null,
  onCancelRequest,
  canSubmit,
  canQueue,
  canDraft = backend.phase === "ready",
  draft,
  setDraft,
  onSubmit,
  onSendAnswers,
  composerRef,
  queueRef,
  queuedMessages,
  queueDispatchingId,
  queuePaused,
  queueStatus,
  onOpenQueueHead,
  resumeQueuedMessages,
  setQueueAnnouncement,
  clearQueuedMessages,
  removeQueuedMessage,
  attachedFiles,
  attachmentImporting,
  attachmentNotice,
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
  runningTasks,
}: ChatComposerProps) {
  const approvalsEnabled =
    backend.phase === "ready" &&
    approvalsVisible &&
    approvalBotId.length > 0 &&
    selectedId.length > 0;
  const approvalResource = useApiResource<{ approvals?: unknown[] }>(
    approvalsEnabled ? "/execution/approvals?status=pending" : null,
    [approvalsEnabled],
    approvalBotId,
  );
  useVisibleInterval(approvalResource.reload, 5_000, approvalsEnabled);
  const approvals = pendingApprovalsForSession(
    approvalResource.data?.approvals,
    selectedId,
  );
  const pendingApprovals = approvals.length;
  const inputRequestsEnabled =
    approvalsEnabled && typeof onSendAnswers === "function";
  const inputRequestsResource = useApiResource<{ requests?: unknown[] }>(
    inputRequestsEnabled ? "/execution/input-requests?status=pending" : null,
    [inputRequestsEnabled],
    approvalBotId,
  );
  useVisibleInterval(inputRequestsResource.reload, 5_000, inputRequestsEnabled);
  const inputRequests = pendingInputRequestsForSession(
    inputRequestsResource.data?.requests,
    selectedId,
  );
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
  const [promptEntries, setPromptEntries] = useState(() =>
    typeof window === "undefined" ? [] : loadPromptLibrary(window.localStorage),
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const toolsRef = useRef<HTMLDetailsElement>(null);
  const toolsOwnerRef = useRef(selectedId);

  useEffect(() => {
    if (toolsOwnerRef.current === selectedId) return;
    toolsOwnerRef.current = selectedId;
    setDetailsOpen(false);
    if (toolsRef.current) toolsRef.current.open = false;
  }, [selectedId]);

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

  const reusableRequested = draft.trimStart().startsWith("$");
  const skillCatalog = useApiResource<{ skills?: unknown }>(
    reusableRequested && backend.phase === "ready" && workspacePath
      ? "/skills"
      : null,
    [workspacePath],
  );
  const skills = useMemo(
    () =>
      buildSkillCatalogEntries(
        asArray(skillCatalog.data?.skills).map(asRecord),
      ),
    [skillCatalog.data],
  );
  const reusableSuggestions =
    commandMenuDismissed || !reusableRequested
      ? []
      : reusableCompletions(draft, promptEntries, skills, activeProject?.id);

  const commandMenuOpen = commandSuggestions.length > 0;
  const reusableMenuOpen = reusableSuggestions.length > 0;
  const commandCompletionsId = controlId("chat-command-completions");
  const reusableCompletionsId = controlId("chat-reusable-completions");
  const activeCompletionsId = commandMenuOpen
    ? commandCompletionsId
    : reusableMenuOpen
      ? reusableCompletionsId
      : undefined;
  const completionPopupOpen = activeCompletionsId !== undefined;
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
  const canInspectContext = hasMemoryMatches || hasContextDetails;
  const showOperationalStatus = Boolean(
    activeRequest ||
      backend.phase !== "ready" ||
      runningTasks > 0 ||
      pendingApprovals > 0 ||
      (bot && !bot.isDefault && bot.state !== "ready"),
  );
  const dispatchingQueueItem = queuedMessages.some(
    (message) => message.id === queueDispatchingId,
  );
  const operationalLabel = isCancellingActive
    ? "Stopping"
    : activeRequest
      ? pendingApprovals > 0 || bot?.state === "waiting"
        ? `${bot?.name ?? "Doolittle"} waiting`
        : bot && (bot.state === "stopped" || bot.state === "starting")
          ? `Starting ${bot.name}`
          : `${bot?.name ?? "Doolittle"} working`
      : bot &&
          !bot.isDefault &&
          ["stopped", "waiting", "error", "archived"].includes(bot.state)
        ? `${bot.name} ${bot.state}`
        : bot && !bot.isDefault && bot.state === "starting"
          ? `${bot.name} starting`
          : bot && !bot.isDefault && bot.state === "busy"
            ? `${bot.name} working`
            : backend.phase === "booting"
              ? "Starting local runtime"
              : backend.phase === "degraded"
                ? "Runtime needs attention"
                : backend.phase === "stopped"
                  ? "Runtime stopped"
                  : "Runtime ready";
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
  const workspaceSelector =
    !workspaceBound &&
    projects &&
    onChooseRepository &&
    onOpenProjectManager &&
    onSelectProjectForNewChat ? (
      <ComposerProjectSelector
        key={selectedId}
        target={workspaceTarget ?? { kind: "unconfirmed" }}
        onChooseRepository={onChooseRepository}
        onManageProjects={onOpenProjectManager}
        onSelectProject={onSelectProjectForNewChat}
        projects={projects}
      />
    ) : null;

  useEffect(() => {
    if (canInspectContext) return;
    setDetailsOpen(false);
  }, [canInspectContext]);

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
      <div className="chat-composer-notices">
        {workspaceNotice}
        <InlineApprovalPanel
          active={approvalsEnabled}
          approvals={approvals}
          botId={approvalBotId}
          compact={approvalHeightBudget !== null && approvalHeightBudget < 144}
          resource={approvalResource}
          roomId={selectedId}
        />
        <InlineInputRequestPanel
          active={inputRequestsEnabled}
          botId={approvalBotId}
          disabled={Boolean(activeRequest)}
          onPrefillDraft={(text) => setDraft(text)}
          onSendAnswers={onSendAnswers ?? (() => false)}
          requests={inputRequests}
          resource={inputRequestsResource}
        />
      </div>
      {showOperationalStatus ? (
        <div className="chat-composer-status" role="status">
          <StatusBadge
            className="chat-status-badge"
            label={operationalLabel}
            pulse={
              Boolean(activeRequest) &&
              pendingApprovals === 0 &&
              (!bot ||
                bot.isDefault ||
                bot.state === "ready" ||
                bot.state === "busy")
            }
            tone={
              bot?.state === "error"
                ? "danger"
                : bot?.state === "waiting" || pendingApprovals > 0
                  ? "warning"
                  : bot?.state === "stopped" || bot?.state === "archived"
                    ? "muted"
                    : activeRequest || bot?.state === "busy"
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
              {runningTasks} runtime task{runningTasks === 1 ? "" : "s"} active
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
      {queuedMessages.length > 0 ? (
        <div className="chat-message-queue" ref={queueRef}>
          <div className="chat-message-queue-heading">
            <strong>
              <UiIcon icon={ListEnd} size="xs" />
              {queuedMessages.length} queued{" "}
              {queuedMessages.length === 1 ? "message" : "messages"}
            </strong>
            <span>
              {queuePaused ? (
                <button onClick={resumeQueuedMessages} type="button">
                  Resume queue
                </button>
              ) : null}
              <button
                disabled={dispatchingQueueItem && queuedMessages.length === 1}
                onClick={clearQueuedMessages}
                type="button"
              >
                {dispatchingQueueItem ? "Clear waiting" : "Clear queue"}
              </button>
            </span>
          </div>
          {queueStatus ? (
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <span className="chat-queue-status" role="status">
                {queueStatus}
              </span>
              {onOpenQueueHead ? (
                <button onClick={onOpenQueueHead} type="button">
                  Open earlier chat
                </button>
              ) : null}
            </div>
          ) : null}
          <ol aria-label="Queued messages">
            {queuedMessages.map((message, index) => (
              <li key={message.id}>
                <span aria-hidden="true">{index + 1}</span>
                <p title={message.content}>{message.content}</p>
                {message.attachments.length > 0 ? (
                  <small>
                    {message.attachments.length}{" "}
                    {message.attachments.length === 1 ? "file" : "files"}
                  </small>
                ) : null}
                {message.id === queueDispatchingId ? (
                  <small role="status">Delivery in progress</small>
                ) : null}
                <button
                  aria-label={`Remove queued message ${index + 1}`}
                  data-queue-remove
                  disabled={message.id === queueDispatchingId}
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
            <span
              title={`${MAX_MESSAGE_ATTACHMENTS} files or 50 MB per message`}
            >
              {attachedFiles.length}{" "}
              {attachedFiles.length === 1 ? "file" : "files"}
              {" · "}
              {attachmentSize(attachmentTotalBytes)}
            </span>
          </li>
        </ul>
      ) : null}
      {chatContextCapsule ? (
        <div className="chat-context-capsule" role="status">
          <span className="chat-context-capsule__icon" aria-hidden="true">
            <ContextCapsuleIcon kind={chatContextCapsule.kind} />
          </span>
          <span
            className="chat-context-capsule__label"
            title={chatContextCapsule.path}
          >
            {contextCapsuleLabel(chatContextCapsule.kind)} ·{" "}
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
            <UiIcon icon={X} size="xs" />
          </button>
        </div>
      ) : null}
      {attachmentNotice ? (
        <p className="chat-attachment-notice" role="status">
          {attachmentNotice}
        </p>
      ) : null}
      {composerValidationError ? (
        <div
          className="chat-composer-validation"
          id={controlId("chat-composer-validation")}
          role="alert"
        >
          {composerValidationError}
        </div>
      ) : null}
      {commandMenuOpen ? (
        <div
          aria-label="Chat commands"
          className="chat-completion-list chat-command-completions"
          id={commandCompletionsId}
          role="listbox"
        >
          {commandSuggestions.map((command, index) => (
            <div
              aria-disabled={command.disabledReason ? true : undefined}
              aria-selected={index === activeCommandIndex}
              className="chat-completion-option chat-command-option"
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
              onMouseMove={() => {
                if (!command.disabledReason) setCommandSelection(index);
              }}
              role="option"
              tabIndex={-1}
            >
              <code className="font-[var(--font-mono)] text-[length:var(--text-control)] text-[var(--accent)]">
                {command.command}
              </code>
              <span className="flex min-w-0 flex-col gap-0.5 [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap">
                <strong className="text-[length:var(--text-control)] font-semibold">
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
      {reusableMenuOpen && !commandMenuOpen ? (
        <div
          aria-label="Reusable prompts and skills"
          className="chat-completion-list chat-reusable-completions"
          id={reusableCompletionsId}
          role="listbox"
        >
          <div className="flex items-center justify-between gap-3 px-2.5 py-1.5 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
            <span>Reusable prompts &amp; skills</span>
            <kbd>$</kbd>
          </div>
          {reusableSuggestions.map((suggestion, index) => (
            <div
              aria-selected={index === activeCommandIndex}
              className="chat-completion-option chat-reusable-option"
              id={controlId(`chat-reusable-option-${index}`)}
              key={suggestion.id}
              onClick={() => selectReusableSuggestion(suggestion)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                selectReusableSuggestion(suggestion);
              }}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setCommandSelection(index)}
              role="option"
              tabIndex={-1}
            >
              <span className="flex min-w-0 flex-col gap-0.5 [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap">
                <strong className="text-[length:var(--text-control)] font-semibold text-[var(--text)]">
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
      {reusableRequested && skillCatalog.error ? (
        <div className="chat-command-catalog-error" role="alert">
          Skills unavailable: {skillCatalog.error}
        </div>
      ) : null}
      <div className="chat-composer-main">
        <ElizaTextarea
          className="chat-composer-input"
          aria-activedescendant={activeCommandId}
          aria-autocomplete="list"
          aria-describedby={
            composerValidationError
              ? `${controlId("chat-composer-hint")} ${controlId("chat-composer-validation")}`
              : controlId("chat-composer-hint")
          }
          aria-controls={activeCompletionsId}
          aria-expanded={completionPopupOpen}
          aria-errormessage={
            composerValidationError
              ? controlId("chat-composer-validation")
              : undefined
          }
          aria-haspopup="listbox"
          aria-invalid={composerValidationError ? true : undefined}
          aria-label={`Message ${bot?.name ?? "Doolittle"}`}
          id={controlId("chat-composer-input")}
          disabled={!canDraft}
          onChange={(event) => {
            setDraft(event.target.value);
            setCommandMenuDismissed(false);
            setCommandSelection(0);
          }}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (
              event.defaultPrevented ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229
            )
              return;
            if (
              completionCount > 0 &&
              !event.shiftKey &&
              !event.altKey &&
              !event.metaKey &&
              !event.ctrlKey
            ) {
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
                  if (selected && !selected.disabledReason) {
                    selectCommandSuggestion(selected);
                  }
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
              if (activeRequest ? canQueue && !isCancellingActive : canSubmit) {
                event.currentTarget.form?.requestSubmit();
              }
            }
          }}
          placeholder={
            canDraft
              ? activeProject
                ? `What should we work on in ${activeProject.name}?`
                : `Message ${bot?.name ?? "Doolittle"}…`
              : "Waiting for the local runtime…"
          }
          ref={composerRef}
          role="combobox"
          rows={1}
          variant="default"
          density="compact"
          value={draft}
        />
      </div>
      <div className="chat-composer-footer">
        <div className="chat-composer-tools">
          <ElizaButton
            aria-label="Attach multiple files"
            aria-busy={attachmentImporting || undefined}
            className="chat-composer-icon-button"
            disabled={attachmentImporting}
            onClick={() => void pickContextFiles()}
            size="sm"
            title={attachmentImporting ? "Importing files" : "Attach files"}
            type="button"
            variant="secondary"
          >
            <UiIcon
              icon={attachmentImporting ? LoaderCircle : Plus}
              size="md"
              className={
                attachmentImporting
                  ? "animate-spin motion-reduce:animate-none"
                  : undefined
              }
            />
          </ElizaButton>
          <span aria-live="polite" className="sr-only" role="status">
            {attachmentImporting ? "Importing file context…" : ""}
          </span>
          <details
            className="chat-tools-disclosure"
            ref={toolsRef}
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
              className="chat-composer-icon-button"
            >
              <UiIcon icon={Ellipsis} size="md" />
            </summary>
            <div className="chat-composer-tool-menu">
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
          <div
            className="chat-composer-routing"
            data-has-project={workspaceSelector ? "true" : undefined}
          >
            {workspaceSelector}
          </div>
        </div>
        <div className="chat-composer-dispatch">
          {canInspectContext ? (
            <ElizaButton
              aria-controls={controlId("chat-composer-details")}
              aria-label={detailsLabel}
              aria-expanded={detailsOpen}
              className="chat-composer-meta-toggle chat-composer-icon-button"
              onClick={() => setDetailsOpen((current) => !current)}
              size="sm"
              title={detailsLabel}
              type="button"
              variant="ghost"
            >
              <UiIcon icon={CircleGauge} size="sm" />
              <span className="chat-composer-meta-toggle__label">
                {detailsLabel}
              </span>
            </ElizaButton>
          ) : null}
          <ComposerModelSelector
            bot={bot && !bot.isDefault ? bot : undefined}
            active={backend.phase === "ready"}
            onOpenModelsPage={onOpenModelsPage}
            onOpenProvidersPage={onOpenProvidersPage}
            refreshRuntime={refreshRuntime}
            runtime={runtime}
          />
          <VoiceComposerButton
            disabled={backend.phase !== "ready"}
            presentationActive={approvalsVisible}
            importAndTranscribe={importAndTranscribeRecording}
            onTranscript={insertDictationTranscript}
          />
          {activeRequest && canQueue && !isCancellingActive ? (
            <ElizaButton
              aria-label="Queue message"
              aria-keyshortcuts="Enter"
              className="chat-composer-queue"
              title="Queue message (Enter)"
              type="submit"
              variant="ghost"
            >
              <UiIcon icon={ListEnd} size="sm" />
              <span className="chat-composer-action-label">Queue</span>
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
            aria-keyshortcuts={
              isCancellingActive
                ? undefined
                : activeRequest
                  ? "Escape"
                  : "Enter"
            }
            className="chat-composer-submit"
            data-mode={activeRequest ? "stop" : "send"}
            disabled={isCancellingActive || (!activeRequest && !canSubmit)}
            onClick={
              activeRequest ? () => onCancelRequest(activeRequest) : undefined
            }
            size="sm"
            title={
              activeRequest ? "Stop response (Escape)" : "Send message (Enter)"
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
              size="md"
            />
            <span className="chat-composer-action-label sr-only">
              {isCancellingActive
                ? "Stopping…"
                : activeRequest
                  ? "Stop"
                  : "Send"}
            </span>
          </ElizaButton>
        </div>
      </div>
      <small className="sr-only" id={controlId("chat-composer-hint")}>
        {isCancellingActive
          ? "Stopping response"
          : activeRequest
            ? canQueue
              ? "Enter to queue. Escape to stop."
              : "Escape to stop."
            : "Enter to send."}{" "}
        Shift Enter for a new line.
      </small>
      {detailsOpen && canInspectContext ? (
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
            <span className="chat-context-meter-heading">
              <strong>Context usage</strong>
              <small>
                {selectedContext
                  ? `${contextPressureLabel(selectedContext)} · ${fileName(
                      workspacePath,
                    )}`
                  : usageLoading === selectedId
                    ? "Measuring…"
                    : selectedUsageError
                      ? "Unavailable"
                      : "Not measured"}
              </small>
            </span>
            {selectedContext ? (
              <span className="chat-context-track" aria-hidden="true">
                <i
                  className="chat-context-fill"
                  style={{ width: `${selectedContextPercent}%` }}
                />
              </span>
            ) : null}
            <small className="chat-context-route" title={modelRouteLabel}>
              {modelRouteLabel}
            </small>
          </div>
        </div>
      ) : null}
    </ComposerFrame>
  );
}
