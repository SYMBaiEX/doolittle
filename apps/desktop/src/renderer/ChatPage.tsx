import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BackendState,
  ChatEvent,
  CommandCatalogItem,
  CommandCatalogResponse,
  DesktopRunUpdate,
  ManagedAttachmentDescriptor,
  RuntimeStatus,
  SavedProfileRecallResponse,
  SessionForkResponse,
  SessionMessagesResponse,
  SessionSummary,
  SessionUsageSummary,
} from "../shared/contracts";
import { commandCompletions } from "./command-completion";
import {
  ComposerModelSelector,
  ComposerProjectSelector,
} from "./components/ComposerSelectors";
import { InlineApprovalPanel } from "./components/InlineApprovalPanel";
import { MessageContent } from "./components/MessageContent";
import {
  parseAgentMessage,
  visibleAssistantText,
} from "./components/message-output";
import type { ProjectLike, ProjectScope } from "./components/ProjectManager";
import { RouteControlDialog } from "./components/RouteControlDialog";
import {
  type ThreadWorkbenchFullView,
  ThreadWorkbenchRail,
} from "./components/ThreadWorkbenchRail";
import {
  VoiceComposerButton,
  type VoiceRecorderMime,
} from "./components/VoiceComposerButton";
import {
  type ContextPressureSnapshot,
  clampContextPercent,
  contextPressureLabel,
  contextPressureTone,
} from "./context-pressure";
import {
  CONVERSATION_PINS_EVENT,
  loadConversationDrafts,
  loadConversationPins,
  loadConversationQueue,
  loadPromptLibrary,
  type PersistedQueuedMessage,
  type PromptLibraryEntry,
  saveConversationDrafts,
  saveConversationPins,
  saveConversationQueue,
  savePromptLibrary,
} from "./conversation-persistence";
import { Badge, displayTimestamp, EmptyBlock, errorMessage } from "./lib";
import {
  canRecallSavedProfileMatches,
  freezeMemoryMatchSnapshot,
  type MemoryMatchSnapshot,
  normalizeSavedProfileMatches,
  type SavedProfileMatch,
} from "./memory-matches";

type Role = "user" | "assistant";
type CopyState = "copied" | "failed";

interface DisplayMessage {
  id: string;
  role: Role;
  content: string;
  attachments?: ManagedAttachmentDescriptor[];
  createdAt: string;
  pending?: boolean;
  error?: boolean;
  memoryMatch?: MemoryMatchSnapshot;
}

type ConversationStore = Record<string, DisplayMessage[]>;

interface SessionForRender extends SessionSummary {
  pinned: boolean;
}

interface MemoryMatchState {
  query: string;
  matches: SavedProfileMatch[];
  status: "idle" | "loading" | "ready" | "error";
}

interface RunReceipt {
  latest: DesktopRunUpdate;
  events: DesktopRunUpdate[];
}

type RunReceiptStore = Record<string, RunReceipt>;

interface SessionUsageResponse {
  usage?: SessionUsageSummary;
}

const STORAGE_KEY = "doolittle.desktop.conversations.v2";
const INSPECTOR_STORAGE_KEY = "doolittle.desktop.chat-inspector-visible.v1";
const MAX_MESSAGE_ATTACHMENTS = 8;
const MAX_MESSAGE_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MEMORY_MATCH_DEBOUNCE_MS = 380;
function newConversationId(): string {
  return `desktop:${crypto.randomUUID()}`;
}

function loadMessages(): ConversationStore {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return {};
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(([, messages]) => Array.isArray(messages)),
    ) as ConversationStore;
  } catch {
    return {};
  }
}

function loadInspectorVisibility(): boolean {
  try {
    const value = localStorage.getItem(INSPECTOR_STORAGE_KEY);
    return value ? JSON.parse(value) === true : false;
  } catch {
    return false;
  }
}

function eventText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  return (
    ([record.detail, record.message, record.event].find(
      (value) => typeof value === "string",
    ) as string | undefined) ?? ""
  );
}

function fileName(value: string): string {
  return value.split(/[/\\]+/u).pop() || "local workspace";
}

function isCommandMessage(message: string): boolean {
  return message.startsWith("/") || message.startsWith("!");
}

function attachmentSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.ceil(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function isDesktopRunUpdate(value: unknown): value is DesktopRunUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const update = value as Partial<DesktopRunUpdate>;
  return (
    typeof update.type === "string" &&
    typeof update.sessionId === "string" &&
    Boolean(
      update.run &&
        typeof update.run === "object" &&
        typeof update.run.runId === "string" &&
        typeof update.run.status === "string",
    )
  );
}

function runEventKey(update: DesktopRunUpdate): string {
  const mutation = update.run.localMutations.at(-1);
  return [
    update.type,
    update.run.observedActionCount,
    update.run.activeAction,
    update.run.lastAction,
    update.run.statusDetail,
    update.run.pendingApprovals,
    mutation?.recordedAt,
  ].join(":");
}

function runEventCopy(update: DesktopRunUpdate): {
  label: string;
  detail: string;
  tone: "neutral" | "good" | "warn" | "bad";
} {
  const { run, type } = update;
  const mutation = run.localMutations.at(-1);
  switch (type) {
    case "started":
      return {
        label: "Run started",
        detail: `${run.runDepth} depth · ${run.configuredMaxIterations} iteration cap`,
        tone: "neutral",
      };
    case "thinking":
      return {
        label: "Thinking",
        detail: run.statusDetail || "Planning the next step",
        tone: "neutral",
      };
    case "acting":
    case "action-started":
      return {
        label: run.activeAction || "Tool started",
        detail: `Action ${Math.max(1, run.observedActionCount)} in progress`,
        tone: "warn",
      };
    case "action-completed":
      return {
        label: run.lastAction || "Tool completed",
        detail: `${run.observedActionCount} ${
          run.observedActionCount === 1 ? "action" : "actions"
        } observed`,
        tone: "good",
      };
    case "local-mutation":
      return {
        label: mutation?.success ? "Workspace changed" : "Change failed",
        detail: mutation
          ? `${mutation.action} · ${fileName(
              mutation.resolvedPath || mutation.requestedPath || "workspace",
            )}${
              mutation.bytes === undefined ? "" : ` · ${mutation.bytes} bytes`
            }`
          : "A local mutation was recorded",
        tone: mutation?.success ? "good" : "bad",
      };
    case "approvals":
      return {
        label: "Approval required",
        detail: `${run.pendingApprovals} pending ${
          run.pendingApprovals === 1 ? "decision" : "decisions"
        }`,
        tone: "warn",
      };
    case "waiting":
      return {
        label: "Waiting",
        detail: run.statusDetail || "Waiting for the next runtime signal",
        tone: run.pendingApprovals > 0 ? "warn" : "neutral",
      };
    case "completed":
      return {
        label: "Run completed",
        detail: `${run.observedActionCount} ${
          run.observedActionCount === 1 ? "action" : "actions"
        } · ${run.localMutations.length} ${
          run.localMutations.length === 1 ? "change" : "changes"
        }`,
        tone: "good",
      };
    case "error":
      return {
        label: "Run failed",
        detail: run.errorMessage || run.statusDetail || "Unknown runtime error",
        tone: "bad",
      };
    default:
      return {
        label: "Run update",
        detail: run.statusDetail || run.status,
        tone: "neutral",
      };
  }
}

function RunReceiptView({
  pending,
  receipt,
}: {
  pending: boolean;
  receipt: RunReceipt;
}) {
  const { latest } = receipt;
  const visibleEvents = receipt.events.filter(
    (event) => !["heartbeat", "message", "stream"].includes(event.type),
  );
  const summary =
    latest.run.terminalReason === "cancelled"
      ? "Stopped by operator"
      : latest.run.errorMessage ||
        latest.run.activeAction ||
        latest.run.statusDetail ||
        latest.run.lastAction ||
        latest.run.status;
  const tone =
    latest.run.status === "complete"
      ? "good"
      : latest.run.status === "error"
        ? "bad"
        : latest.run.status === "cancelled"
          ? "warn"
          : latest.run.pendingApprovals > 0
            ? "warn"
            : "neutral";

  return (
    <details className="chat-run-receipt">
      <summary>
        <span className={`chat-run-state ${tone}`} aria-hidden="true" />
        <span>
          <strong>{pending ? "Working" : "Run complete"}</strong>
          <small>{summary}</small>
        </span>
        <span className="chat-run-metrics">
          {latest.run.observedActionCount} actions ·{" "}
          {latest.run.localMutations.length} changes
        </span>
        <span className="chat-run-chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <ol>
        {visibleEvents.slice(-14).map((event) => {
          const copy = runEventCopy(event);
          return (
            <li key={`${runEventKey(event)}:${event.run.updatedAt}`}>
              <span className={`chat-run-mark ${copy.tone}`} />
              <span>
                <strong>{copy.label}</strong>
                <small>{copy.detail}</small>
              </span>
              <time>{displayTimestamp(event.run.updatedAt)}</time>
            </li>
          );
        })}
      </ol>
      <footer>
        <Badge tone={tone}>{latest.run.status}</Badge>
        <code>{latest.run.runId}</code>
      </footer>
    </details>
  );
}

function Welcome({
  onSelect,
  projectName,
}: {
  onSelect: (prompt: string) => void;
  projectName?: string;
}) {
  const prompts = [
    {
      prompt: "Review a difficult decision",
      detail: "Pressure-test the tradeoffs",
    },
    {
      prompt: "Plan the next piece of work",
      detail: "Turn the ambiguity into action",
    },
    {
      prompt: "Investigate a technical question",
      detail: "Trace the answer from evidence",
    },
  ];
  return (
    <div className="chat-welcome">
      <span className="eyebrow">{"ElizaOS // private local runtime"}</span>
      <h1>
        Give Doolittle
        <br />
        <em>something difficult.</em>
      </h1>
      <p>
        {projectName
          ? `Start a focused conversation for ${projectName}. Its project context stays attached as you work.`
          : "Think through a decision, investigate a system, or turn an unfinished idea into working software."}
      </p>
      <div className="starter-grid">
        {prompts.map(({ prompt, detail }, index) => (
          <button key={prompt} onClick={() => onSelect(prompt)} type="button">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{prompt}</strong>
            <small>{detail}</small>
            <i aria-hidden="true">↗</i>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatPage({
  backend,
  runtime,
  remoteSessions,
  selectedId,
  workspacePath,
  onSelect,
  refreshRuntime,
  onOpenModelsPage,
  onOpenWorkspaceView,
  activeProject,
  projects,
  projectLabels,
  onChooseRepository,
  onOpenProjectManager,
  onSelectProjectForNewChat,
  onRequestNewConversation,
  pendingApprovals,
  runningTasks,
  titleInAppChrome = false,
}: {
  backend: BackendState;
  runtime: RuntimeStatus | null;
  remoteSessions: SessionSummary[];
  selectedId: string;
  workspacePath: string;
  onSelect: (sessionId: string) => void;
  refreshRuntime: () => void;
  onOpenModelsPage: () => void;
  onOpenWorkspaceView: (view: ThreadWorkbenchFullView) => void;
  activeProject?: {
    id: string;
    name: string;
    color?: string | null;
    primaryPath?: string | null;
  } | null;
  projects?: readonly ProjectLike[];
  projectLabels?: Readonly<Record<string, string>>;
  onChooseRepository?: () => void | Promise<void>;
  onOpenProjectManager?: () => void;
  onSelectProjectForNewChat?: (scope: ProjectScope) => void;
  onRequestNewConversation?: () => void;
  pendingApprovals: number;
  runningTasks: number;
  titleInAppChrome?: boolean;
}) {
  const initialId = useMemo(
    () => selectedId || newConversationId(),
    [selectedId],
  );
  const [messages, setMessages] = useState<ConversationStore>(() => {
    const stored = loadMessages();
    return Object.hasOwn(stored, initialId)
      ? stored
      : { ...stored, [initialId]: [] };
  });
  const draftSessionId = selectedId || initialId;
  const [conversationDrafts, setConversationDrafts] = useState(() =>
    loadConversationDrafts(localStorage),
  );
  const draft = conversationDrafts[draftSessionId] ?? "";
  const setDraft = useCallback(
    (nextValue: SetStateAction<string>) => {
      setConversationDrafts((current) => {
        const previous = current[draftSessionId] ?? "";
        const next =
          typeof nextValue === "function" ? nextValue(previous) : nextValue;
        if (!next) {
          if (!Object.hasOwn(current, draftSessionId)) return current;
          const updated = { ...current };
          delete updated[draftSessionId];
          return updated;
        }
        return { ...current, [draftSessionId]: next };
      });
    },
    [draftSessionId],
  );
  const [memoryMatches, setMemoryMatches] = useState<MemoryMatchState>({
    query: "",
    matches: [],
    status: "idle",
  });
  const [activeRequest, setActiveRequest] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [loadingHistory, setLoadingHistory] = useState("");
  const [inspectorVisible, setInspectorVisible] = useState(
    loadInspectorVisibility,
  );
  const [pinnedSessions, setPinnedSessions] = useState(() =>
    loadConversationPins(localStorage),
  );
  const [sessionSearch, setSessionSearch] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<
    ManagedAttachmentDescriptor[]
  >([]);
  const recoveredQueue = useMemo(() => loadConversationQueue(localStorage), []);
  const [queuedMessages, setQueuedMessages] =
    useState<PersistedQueuedMessage[]>(recoveredQueue);
  const [queuePaused, setQueuePaused] = useState(recoveredQueue.length > 0);
  const [queueAnnouncement, setQueueAnnouncement] = useState(
    recoveredQueue.length > 0
      ? `${recoveredQueue.length} queued ${
          recoveredQueue.length === 1 ? "message was" : "messages were"
        } recovered. Review and resume when ready.`
      : "",
  );
  const [runReceipts, setRunReceipts] = useState<RunReceiptStore>({});
  const [copyStates, setCopyStates] = useState<Record<string, CopyState>>({});
  const [forkingMessageId, setForkingMessageId] = useState("");
  const [promptLibrary, setPromptLibrary] = useState<PromptLibraryEntry[]>(() =>
    loadPromptLibrary(localStorage),
  );
  const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
  const [promptTitle, setPromptTitle] = useState("");
  const [promptScope, setPromptScope] = useState<"general" | "project">(
    activeProject ? "project" : "general",
  );
  const [editingPromptId, setEditingPromptId] = useState("");
  const [editingPromptTitle, setEditingPromptTitle] = useState("");
  const [speakingMessageId, setSpeakingMessageId] = useState("");
  const [sessionUsage, setSessionUsage] = useState<
    Record<string, ContextPressureSnapshot>
  >({});
  const [usageLoading, setUsageLoading] = useState("");
  const [usageErrors, setUsageErrors] = useState<Record<string, string>>({});
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [attachmentValidationError, setAttachmentValidationError] =
    useState("");
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
  const [commandSelection, setCommandSelection] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const [commandCatalog, setCommandCatalog] = useState<{
    commands: CommandCatalogItem[];
    error: string;
  }>({ commands: [], error: "" });
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const promptRenameRef = useRef<HTMLInputElement>(null);
  const mobileConversationsButtonRef = useRef<HTMLButtonElement>(null);
  const mobileConversationsDialogRef = useRef<HTMLDivElement>(null);
  const mobileConversationsWasOpen = useRef(false);
  const queueRef = useRef<HTMLDivElement>(null);
  const queueDispatchRef = useRef<string | null>(null);
  const requestSession = useRef<Record<string, string>>({});
  const requestedHistory = useRef(new Set<string>());
  const chatHandler = useRef<(event: ChatEvent) => void>(() => {});
  const memoryRecallSequence = useRef(0);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const pendingBranchAttachments = useRef<{
    sessionId: string;
    attachments: ManagedAttachmentDescriptor[];
  } | null>(null);

  const refreshSessionUsage = useCallback(
    async (sessionId: string) => {
      if (!sessionId || backend.phase !== "ready") return;
      setUsageLoading(sessionId);
      setUsageErrors((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      try {
        const path =
          `/sessions/usage?sessionId=${encodeURIComponent(sessionId)}` as const;
        const response = await window.doolittle.api<SessionUsageResponse>({
          path,
        });
        const context = response.usage?.context;
        if (context) {
          setSessionUsage((current) => ({
            ...current,
            [sessionId]: context,
          }));
        }
      } catch (error) {
        setUsageErrors((current) => ({
          ...current,
          [sessionId]: errorMessage(error),
        }));
      } finally {
        setUsageLoading((current) => (current === sessionId ? "" : current));
      }
    },
    [backend.phase],
  );

  const insertChatContext = useCallback(
    (text: string) => {
      const normalized = text.trim();
      if (!normalized) return;
      setDraft((current) =>
        current.trim() ? `${current}\n\n${normalized}` : normalized,
      );
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [setDraft],
  );

  useEffect(() => {
    if (!selectedId) onSelect(initialId);
  }, [initialId, onSelect, selectedId]);

  useEffect(() => {
    void refreshSessionUsage(selectedId);
  }, [refreshSessionUsage, selectedId]);

  useEffect(() => {
    if (backend.phase !== "ready") {
      setCommandCatalog({ commands: [], error: "" });
      return;
    }

    let cancelled = false;
    void window.doolittle
      .api<CommandCatalogResponse>({ path: "/commands/catalog" })
      .then((response) => {
        if (!cancelled) {
          setCommandCatalog({ commands: response.commands, error: "" });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCommandCatalog({
            commands: [],
            error: `Command catalog unavailable: ${errorMessage(error)}`,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backend.phase]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    saveConversationPins(localStorage, pinnedSessions);
  }, [pinnedSessions]);

  useEffect(() => {
    saveConversationDrafts(localStorage, conversationDrafts);
  }, [conversationDrafts]);

  useEffect(() => {
    saveConversationQueue(localStorage, queuedMessages);
  }, [queuedMessages]);

  useEffect(() => {
    savePromptLibrary(localStorage, promptLibrary);
  }, [promptLibrary]);

  useEffect(() => {
    if (!activeProject) setPromptScope("general");
  }, [activeProject]);

  useEffect(() => {
    if (editingPromptId) promptRenameRef.current?.focus();
  }, [editingPromptId]);

  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
      speechUtteranceRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const syncPins = () =>
      setPinnedSessions(loadConversationPins(localStorage));
    window.addEventListener(CONVERSATION_PINS_EVENT, syncPins);
    return () => window.removeEventListener(CONVERSATION_PINS_EVENT, syncPins);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      INSPECTOR_STORAGE_KEY,
      JSON.stringify(inspectorVisible),
    );
  }, [inspectorVisible]);

  useEffect(() => {
    if (!queueAnnouncement) return;
    const timeout = window.setTimeout(() => setQueueAnnouncement(""), 2_500);
    return () => window.clearTimeout(timeout);
  }, [queueAnnouncement]);

  useEffect(() => {
    if (!mobileConversationsOpen) return;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileConversationsOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        mobileConversationsDialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        mobileConversationsDialogRef.current?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleEscape);
    requestAnimationFrame(() => {
      mobileConversationsDialogRef.current
        ?.querySelector<HTMLButtonElement>("[data-mobile-conversation]")
        ?.focus();
    });
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileConversationsOpen]);

  useEffect(() => {
    if (mobileConversationsOpen) {
      mobileConversationsWasOpen.current = true;
    } else if (mobileConversationsWasOpen.current) {
      mobileConversationsWasOpen.current = false;
      mobileConversationsButtonRef.current?.focus();
    }
  }, [mobileConversationsOpen]);

  useEffect(() => {
    const query = draft.trim();
    const sequence = memoryRecallSequence.current + 1;
    memoryRecallSequence.current = sequence;
    if (
      backend.phase !== "ready" ||
      isCommandMessage(query) ||
      !canRecallSavedProfileMatches(query)
    ) {
      setMemoryMatches({ query: "", matches: [], status: "idle" });
      return;
    }

    const timeout = window.setTimeout(() => {
      setMemoryMatches((current) => ({
        query,
        matches: current.query === query ? current.matches : [],
        status: "loading",
      }));
      const path =
        `/profiles/users/recall?userId=desktop-user&query=${encodeURIComponent(query)}` as const;
      void window.doolittle
        .api<SavedProfileRecallResponse>({ path })
        .then((response) => {
          if (memoryRecallSequence.current !== sequence) return;
          setMemoryMatches({
            query,
            matches: normalizeSavedProfileMatches(response),
            status: "ready",
          });
        })
        .catch(() => {
          if (memoryRecallSequence.current !== sequence) return;
          setMemoryMatches({ query, matches: [], status: "error" });
        });
    }, MEMORY_MATCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [backend.phase, draft]);

  useEffect(() => {
    const handleToggleInspector = () => {
      setInspectorVisible((current) => !current);
    };
    window.addEventListener(
      "doolittle:toggle-inspector",
      handleToggleInspector,
    );
    return () =>
      window.removeEventListener(
        "doolittle:toggle-inspector",
        handleToggleInspector,
      );
  }, []);

  useEffect(() => {
    const handleInsertContext = (event: Event) => {
      const text =
        event instanceof CustomEvent &&
        event.detail &&
        typeof event.detail === "object" &&
        typeof event.detail.text === "string"
          ? event.detail.text.trim()
          : "";
      insertChatContext(text);
    };
    window.addEventListener(
      "doolittle:insert-chat-context",
      handleInsertContext,
    );
    return () =>
      window.removeEventListener(
        "doolittle:insert-chat-context",
        handleInsertContext,
      );
  }, [insertChatContext]);

  useEffect(() => {
    const selectedIsRemote = remoteSessions.some(
      (session) => session.sessionId === selectedId,
    );
    if (!selectedId || selectedIsRemote) {
      return;
    }
    setMessages((current) =>
      Object.hasOwn(current, selectedId)
        ? current
        : { ...current, [selectedId]: [] },
    );
  }, [remoteSessions, selectedId]);

  useEffect(() => {
    const pending = pendingBranchAttachments.current;
    if (pending?.sessionId === selectedId) {
      setAttachedFiles(pending.attachments);
      pendingBranchAttachments.current = null;
    } else {
      setAttachedFiles([]);
    }
    setAttachmentValidationError("");
  }, [selectedId]);

  useEffect(() => {
    const unsubscribe = window.doolittle.onChatEvent((event) =>
      chatHandler.current(event),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const remoteSession = remoteSessions.find(
      (session) => session.sessionId === selectedId,
    );
    const selectedRequestIsActive =
      Boolean(activeRequest) &&
      requestSession.current[activeRequest ?? ""] === selectedId;
    if (
      backend.phase !== "ready" ||
      !selectedId ||
      !remoteSession ||
      selectedRequestIsActive
    ) {
      return;
    }
    const historyVersion = [
      selectedId,
      remoteSession.messageCount,
      remoteSession.endedAt ?? "",
    ].join(":");
    if (requestedHistory.current.has(historyVersion)) return;

    requestedHistory.current.add(historyVersion);
    setLoadingHistory(selectedId);
    setHistoryError("");
    const path =
      `/sessions/messages?sessionId=${encodeURIComponent(selectedId)}&limit=500` as const;
    void window.doolittle
      .api<SessionMessagesResponse>({ path })
      .then((response) => {
        const history = response.messages
          .filter(
            (message) =>
              message.role === "user" || message.role === "assistant",
          )
          .map<DisplayMessage>((message) => ({
            id: message.id,
            role: message.role as Role,
            content: message.text,
            attachments: message.attachments,
            createdAt: message.createdAt,
          }));
        setMessages((current) => ({ ...current, [selectedId]: history }));
      })
      .catch((error) => {
        requestedHistory.current.delete(historyVersion);
        setHistoryError(errorMessage(error));
      })
      .finally(() =>
        setLoadingHistory((current) => (current === selectedId ? "" : current)),
      );
  }, [activeRequest, backend.phase, remoteSessions, selectedId]);

  const sessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase();
    const byId = new Map(
      remoteSessions.map((session) => [session.sessionId, session]),
    );

    for (const [sessionId, localMessages] of Object.entries(messages)) {
      const firstUser = localMessages.find(
        (message) => message.role === "user",
      );
      const last = localMessages.at(-1);
      const remoteSession = byId.get(sessionId);
      byId.set(sessionId, {
        ...remoteSession,
        sessionId,
        title:
          remoteSession?.title ??
          firstUser?.content.slice(0, 52) ??
          "New conversation",
        messageCount: localMessages.length,
        endedAt: last?.createdAt,
        participants: [],
        preview: firstUser ? [firstUser.content] : [],
      });
    }

    return [...byId.values()]
      .filter((session) => {
        if (!query) return true;
        const searchable = [
          session.title ?? "",
          session.sessionId,
          session.preview?.[0] ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      })
      .map((session) => {
        return {
          ...session,
          pinned: Boolean(pinnedSessions[session.sessionId]),
        };
      })
      .sort((left, right) => {
        if (left.pinned !== right.pinned) {
          return left.pinned ? -1 : 1;
        }
        return (right.endedAt ?? "").localeCompare(left.endedAt ?? "");
      }) as SessionForRender[];
  }, [messages, pinnedSessions, remoteSessions, sessionSearch]);

  const selectedMessages = messages[selectedId] ?? [];
  const selectedSession = sessions.find(
    (session) => session.sessionId === selectedId,
  );
  const selectedContext = sessionUsage[selectedId];
  const selectedUsageError = usageErrors[selectedId];
  const selectedUpdatedAt =
    selectedSession?.endedAt ??
    selectedMessages.at(-1)?.createdAt ??
    selectedSession?.startedAt;
  const selectedMessageCount =
    selectedSession?.messageCount ?? selectedMessages.length;
  const selectedContextPercent = selectedContext
    ? clampContextPercent(selectedContext.percent)
    : 0;
  const selectedContextTone = selectedContext
    ? contextPressureTone(selectedContext.usageFraction)
    : "neutral";
  const latestAssistant = [...selectedMessages]
    .reverse()
    .find((message) => message.role === "assistant");
  const accessibilityStatus =
    loadingHistory === selectedId
      ? "Loading conversation."
      : queueAnnouncement ||
        progress ||
        (latestAssistant && !latestAssistant.pending
          ? "Doolittle replied."
          : "");

  const updateAssistant = (
    sessionId: string,
    requestId: string,
    update: (message: DisplayMessage) => DisplayMessage,
  ) => {
    setMessages((current) => ({
      ...current,
      [sessionId]: (current[sessionId] ?? []).map((message) =>
        message.id === `assistant:${requestId}` ? update(message) : message,
      ),
    }));
  };

  const finishRequest = (requestId: string) => {
    const completedSessionId = requestSession.current[requestId];
    setActiveRequest((current) => (current === requestId ? null : current));
    setProgress("");
    delete requestSession.current[requestId];
    refreshRuntime();
    if (completedSessionId) {
      void refreshSessionUsage(completedSessionId);
    }
  };

  chatHandler.current = (event) => {
    const sessionId = requestSession.current[event.requestId];
    if (!sessionId) return;
    if (event.event === "agent.run" && isDesktopRunUpdate(event.data)) {
      const update = event.data;
      setRunReceipts((current) => {
        const prior = current[event.requestId];
        const nextKey = runEventKey(update);
        const lastEvent = prior?.events.at(-1);
        const events =
          lastEvent && runEventKey(lastEvent) === nextKey
            ? prior.events
            : [...(prior?.events ?? []), update].slice(-30);
        return {
          ...current,
          [event.requestId]: {
            latest: update,
            events,
          },
        };
      });
      return;
    }
    if (event.event === "response.output_text.delta") {
      const delta =
        event.data && typeof event.data === "object"
          ? String((event.data as { delta?: unknown }).delta ?? "")
          : "";
      updateAssistant(sessionId, event.requestId, (message) => ({
        ...message,
        content: message.content + delta,
      }));
      return;
    }
    if (event.event === "agent.progress" || event.event === "response.notice") {
      setProgress(eventText(event.data) || "Doolittle is working…");
      return;
    }
    if (event.event === "response.completed") {
      const response =
        event.data && typeof event.data === "object"
          ? String((event.data as { response?: unknown }).response ?? "")
          : "";
      updateAssistant(sessionId, event.requestId, (message) => ({
        ...message,
        content: message.content || response || "Done.",
        pending: false,
      }));
      finishRequest(event.requestId);
      return;
    }
    if (event.event === "error") {
      updateAssistant(sessionId, event.requestId, (message) => ({
        ...message,
        content:
          eventText(event.data) || "The response could not be completed.",
        pending: false,
        error: true,
      }));
      finishRequest(event.requestId);
      return;
    }
    if (event.event === "cancelled" || event.event === "response.cancelled") {
      updateAssistant(sessionId, event.requestId, (message) => ({
        ...message,
        content: message.content || "Response stopped.",
        pending: false,
      }));
      finishRequest(event.requestId);
    }
  };

  const copyMessage = async (id: string, value: string) => {
    if (!value || !navigator.clipboard?.writeText) {
      setCopyStates((current) => ({ ...current, [id]: "failed" }));
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyStates((current) => ({ ...current, [id]: "copied" }));
    } catch {
      setCopyStates((current) => ({ ...current, [id]: "failed" }));
    }
    window.setTimeout(() => {
      setCopyStates((current) => {
        const next = { ...current };
        if (Object.hasOwn(next, id)) {
          delete next[id];
        }
        return next;
      });
    }, 1500);
  };

  const speechSupported =
    "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  const stopSpeaking = useCallback(() => {
    if (speechSupported) window.speechSynthesis.cancel();
    speechUtteranceRef.current = null;
    setSpeakingMessageId("");
  }, [speechSupported]);

  const readMessage = useCallback(
    (message: DisplayMessage) => {
      const readableContent =
        message.role === "assistant"
          ? visibleAssistantText(message.content)
          : message.content;
      if (
        !speechSupported ||
        message.role !== "assistant" ||
        message.pending ||
        message.error ||
        !readableContent.trim()
      ) {
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(readableContent);
      speechUtteranceRef.current = utterance;
      setSpeakingMessageId(message.id);
      const finish = () => {
        if (speechUtteranceRef.current !== utterance) return;
        speechUtteranceRef.current = null;
        setSpeakingMessageId("");
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    },
    [speechSupported],
  );

  const renderMessageActions = (message: DisplayMessage): ReactNode => {
    const copyState = copyStates[message.id];
    const label = copyState === "copied" ? "Copied" : "Copy";
    const failed = copyState === "failed";
    const branchDisabled =
      backend.phase !== "ready" ||
      Boolean(activeRequest) ||
      Boolean(message.pending) ||
      Boolean(message.error) ||
      Boolean(forkingMessageId);
    return (
      <div className="chat-message-actions">
        <button
          aria-label="Fork conversation from this message"
          disabled={branchDisabled}
          onClick={() => void branchMessage(message, "fork")}
          title="Keep this transcript unchanged and continue in a new branch"
          type="button"
        >
          {forkingMessageId === message.id ? "Branching…" : "Fork"}
        </button>
        {message.role === "user" ? (
          <button
            aria-label="Edit this message in a new branch"
            disabled={branchDisabled}
            onClick={() => void branchMessage(message, "edit")}
            title="Create a branch before this turn and restore the prompt for editing"
            type="button"
          >
            Edit
          </button>
        ) : !message.pending && !message.error ? (
          <button
            aria-label="Retry this response in a new branch"
            disabled={branchDisabled}
            onClick={() => void branchMessage(message, "retry")}
            title="Regenerate the preceding prompt without deleting this response"
            type="button"
          >
            Retry
          </button>
        ) : null}
        {message.role === "assistant" && !message.pending && !message.error ? (
          <button
            aria-label={
              speechSupported
                ? speakingMessageId === message.id
                  ? "Stop reading response"
                  : "Read response aloud"
                : "Read aloud is unavailable on this device"
            }
            disabled={!speechSupported || !message.content.trim()}
            onClick={() =>
              speakingMessageId === message.id
                ? stopSpeaking()
                : readMessage(message)
            }
            title={
              speechSupported
                ? undefined
                : "Read aloud is not supported by this system."
            }
            type="button"
          >
            {speakingMessageId === message.id ? "Stop" : "Read"}
          </button>
        ) : null}
        <button
          aria-label={failed ? "Copy failed" : "Copy message"}
          onClick={() =>
            void copyMessage(
              message.id,
              message.role === "assistant"
                ? visibleAssistantText(message.content)
                : message.content,
            )
          }
          type="button"
        >
          {failed ? "Copy failed" : label}
        </button>
      </div>
    );
  };

  const sendMessage = async (
    input: string,
    attachments = attachedFiles,
    sessionId = selectedId,
    clearComposer = true,
    memoryMatchOverride?: MemoryMatchSnapshot,
    projectIdOverride?: string | null,
  ) => {
    const content = input.trim();
    if (!content || !sessionId || activeRequest || backend.phase !== "ready") {
      return false;
    }

    if (isCommandMessage(content) && attachments.length > 0) {
      setQueueAnnouncement(
        "Remove message attachments before running a command.",
      );
      return false;
    }
    const messageAttachments = attachments;
    const memoryMatch =
      memoryMatchOverride ?? freezeMemoryMatchSnapshot(content, memoryMatches);
    const requestProjectId =
      projectIdOverride === undefined
        ? activeProject?.id
        : (projectIdOverride ?? undefined);
    const requestId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    requestSession.current[requestId] = sessionId;

    setMessages((current) => ({
      ...current,
      [sessionId]: [
        ...(current[sessionId] ?? []),
        {
          id: crypto.randomUUID(),
          role: "user",
          content,
          attachments: messageAttachments,
          createdAt,
          memoryMatch,
        },
        {
          id: `assistant:${requestId}`,
          role: "assistant",
          content: "",
          createdAt,
          pending: true,
        },
      ],
    }));
    if (clearComposer) {
      setDraft("");
      setAttachedFiles([]);
    }
    setProgress("Doolittle is considering the request…");
    setActiveRequest(requestId);
    try {
      await window.doolittle.startChat({
        requestId,
        message: content,
        roomId: sessionId,
        attachmentIds: messageAttachments.map((attachment) => attachment.id),
        ...(requestProjectId ? { projectId: requestProjectId } : {}),
      } as Parameters<typeof window.doolittle.startChat>[0]);
      return true;
    } catch (error) {
      if (!requestSession.current[requestId]) return false;
      updateAssistant(sessionId, requestId, (message) => ({
        ...message,
        content: errorMessage(error),
        pending: false,
        error: true,
      }));
      finishRequest(requestId);
      return false;
    }
  };

  async function branchMessage(
    message: DisplayMessage,
    mode: "edit" | "fork" | "retry",
  ): Promise<void> {
    if (
      backend.phase !== "ready" ||
      activeRequest ||
      forkingMessageId ||
      message.pending ||
      message.error
    ) {
      return;
    }

    const messageIndex = selectedMessages.findIndex(
      (entry) => entry.id === message.id,
    );
    if (messageIndex < 0) return;

    const retryPrompt =
      mode === "retry"
        ? [...selectedMessages.slice(0, messageIndex)]
            .reverse()
            .find((entry) => entry.role === "user")
        : undefined;
    if (mode === "retry" && !retryPrompt) {
      setQueueAnnouncement("No user prompt is available to retry.");
      return;
    }

    setForkingMessageId(message.id);
    try {
      const boundaryMessage = mode === "retry" ? retryPrompt : message;
      const response = await window.doolittle.api<SessionForkResponse>({
        path: "/sessions/fork",
        method: "POST",
        body:
          mode === "fork"
            ? {
                sourceSessionId: selectedId,
                throughMessageId: boundaryMessage?.id,
              }
            : {
                sourceSessionId: selectedId,
                beforeMessageId: boundaryMessage?.id,
              },
      });
      const fork = response.fork;

      if (mode === "edit") {
        setConversationDrafts((current) => ({
          ...current,
          [fork.sessionId]: message.content,
        }));
        pendingBranchAttachments.current = {
          sessionId: fork.sessionId,
          attachments: message.attachments ?? [],
        };
      }

      await Promise.resolve(refreshRuntime());
      onSelect(fork.sessionId);

      if (mode === "retry" && retryPrompt) {
        const accepted = await sendMessage(
          retryPrompt.content,
          retryPrompt.attachments ?? [],
          fork.sessionId,
          false,
          retryPrompt.memoryMatch,
          fork.projectId ?? null,
        );
        setQueueAnnouncement(
          accepted
            ? "Retry started in a new branch. The original response is unchanged."
            : "The branch was created, but the retry could not be started.",
        );
      } else {
        setQueueAnnouncement(
          mode === "edit"
            ? "Branch created. Edit the restored prompt and send when ready."
            : `Forked ${fork.copiedMessageCount} ${
                fork.copiedMessageCount === 1 ? "message" : "messages"
              } into a new conversation.`,
        );
        if (mode === "edit") {
          requestAnimationFrame(() => composerRef.current?.focus());
        }
      }
    } catch (error) {
      setQueueAnnouncement(
        `Could not create the branch: ${errorMessage(error)}`,
      );
    } finally {
      setForkingMessageId("");
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: sendMessage intentionally consumes the current request state after each queue transition.
  useEffect(() => {
    if (
      activeRequest ||
      backend.phase !== "ready" ||
      queuePaused ||
      queuedMessages.length === 0 ||
      queueDispatchRef.current
    ) {
      return;
    }
    const [next] = queuedMessages;
    if (!next) return;
    queueDispatchRef.current = next.id;
    void sendMessage(
      next.content,
      next.attachments,
      next.sessionId,
      false,
      next.memoryMatch,
      next.projectId ?? null,
    )
      .then((accepted) => {
        if (accepted) {
          setQueuedMessages((current) =>
            current.filter((message) => message.id !== next.id),
          );
        } else {
          setQueuePaused(true);
          setQueueAnnouncement(
            "Queued delivery failed and was paused for review.",
          );
        }
      })
      .finally(() => {
        queueDispatchRef.current = null;
      });
  }, [activeRequest, backend.phase, queuePaused, queuedMessages]);

  const queueCurrentDraft = () => {
    const content = draft.trim();
    if (!content || !selectedId) return;
    if (isCommandMessage(content) && attachedFiles.length > 0) {
      setAttachmentValidationError(
        "Remove message attachments before queueing a command.",
      );
      return;
    }
    setQueuedMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        sessionId: selectedId,
        ...(activeProject?.id ? { projectId: activeProject.id } : {}),
        content,
        attachments: attachedFiles,
        memoryMatch: freezeMemoryMatchSnapshot(content, memoryMatches),
      },
    ]);
    setQueuePaused(false);
    setQueueAnnouncement("Message added to the queue.");
    setDraft("");
    setAttachedFiles([]);
    composerRef.current?.focus();
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (activeRequest) {
      queueCurrentDraft();
      return;
    }
    await sendMessage(draft);
  };

  const createConversation = () => {
    const id = newConversationId();
    setMessages((current) => ({ ...current, [id]: [] }));
    onSelect(id);
  };

  const togglePin = (sessionId: string) => {
    setPinnedSessions((current) => {
      const next = { ...current };
      if (next[sessionId]) {
        delete next[sessionId];
      } else {
        next[sessionId] = true;
      }
      saveConversationPins(localStorage, next);
      window.dispatchEvent(new Event(CONVERSATION_PINS_EVENT));
      return next;
    });
  };

  const pickContextFiles = async () => {
    try {
      const result = await window.doolittle.pickChatAttachments();
      if (result.canceled || result.attachments.length === 0) return;
      const next = [...attachedFiles];
      let totalBytes = next.reduce(
        (sum, attachment) => sum + attachment.sizeBytes,
        0,
      );
      let skipped = 0;
      for (const attachment of result.attachments) {
        if (next.some((entry) => entry.id === attachment.id)) continue;
        if (
          next.length >= MAX_MESSAGE_ATTACHMENTS ||
          totalBytes + attachment.sizeBytes > MAX_MESSAGE_ATTACHMENT_BYTES
        ) {
          skipped += 1;
          continue;
        }
        next.push(attachment);
        totalBytes += attachment.sizeBytes;
      }
      setAttachedFiles(next);
      if (skipped > 0) {
        setAttachmentValidationError(
          `Attachment limit reached. Up to ${MAX_MESSAGE_ATTACHMENTS} files and 50 MB total are allowed.`,
        );
      } else {
        setAttachmentValidationError("");
      }
    } catch (error) {
      setAttachmentValidationError(
        `Could not add file context: ${errorMessage(error)}`,
      );
    }
  };

  const importAndTranscribeRecording = useCallback(
    async (bytes: Uint8Array, mimeType: VoiceRecorderMime, name: string) => {
      const attachment = await window.doolittle.importRecordedAudio({
        bytes,
        mimeType,
        name,
      });
      const result = await window.doolittle.api<{
        transcription: { transcriptText: string };
      }>({
        path: "/media/transcribe-attachment",
        method: "POST",
        body: {
          attachmentId: attachment.id,
          name,
        },
      });
      return { transcriptText: result.transcription.transcriptText };
    },
    [],
  );

  const insertDictationTranscript = useCallback(
    (transcript: string) => {
      setDraft((current) => {
        const trimmed = current.trimEnd();
        return trimmed ? `${trimmed} ${transcript}` : transcript;
      });
      setCommandMenuDismissed(false);
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [setDraft],
  );

  const removeContextFile = (id: string) => {
    setAttachedFiles((current) => current.filter((entry) => entry.id !== id));
    setAttachmentValidationError("");
  };

  const removeQueuedMessage = (id: string) => {
    const index = queuedMessages.findIndex((message) => message.id === id);
    if (index < 0) return;
    const remaining = queuedMessages.filter((message) => message.id !== id);
    setQueuedMessages(remaining);
    setQueueAnnouncement(
      `Queued message removed. ${remaining.length} ${
        remaining.length === 1 ? "message remains" : "messages remain"
      }.`,
    );
    requestAnimationFrame(() => {
      const buttons = queueRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-queue-remove]",
      );
      const nextButton = buttons?.[Math.min(index, remaining.length - 1)];
      if (nextButton) nextButton.focus();
      else composerRef.current?.focus();
    });
  };

  const clearQueuedMessages = () => {
    const count = queuedMessages.length;
    if (!count) return;
    setQueuedMessages([]);
    setQueuePaused(false);
    setQueueAnnouncement(
      `${count} queued ${count === 1 ? "message" : "messages"} cleared.`,
    );
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const toggleInspector = () => {
    setInspectorVisible((current) => !current);
  };

  const runtimeProvider = runtime?.provider ?? "Loading provider";
  const runtimeModel = runtime?.model ?? "Loading model";
  const modelRouteLabel = `${runtimeProvider} · ${runtimeModel}`;
  const commandSuggestions = !commandMenuDismissed
    ? commandCompletions(commandCatalog.commands, draft)
    : [];
  const selectCommandSuggestion = (command: CommandCatalogItem) => {
    if (command.disabledReason) {
      setQueueAnnouncement(command.disabledReason);
      return;
    }
    setDraft(command.command);
    setCommandMenuDismissed(true);
    requestAnimationFrame(() => composerRef.current?.focus());
  };
  const attachmentTotalBytes = attachedFiles.reduce(
    (sum, attachment) => sum + attachment.sizeBytes,
    0,
  );
  const visiblePromptLibrary = promptLibrary.filter((entry) =>
    activeProject && promptScope === "project"
      ? entry.projectId === activeProject.id
      : !entry.projectId,
  );
  const saveCurrentPrompt = () => {
    const content = draft.trim();
    if (!content) {
      setQueueAnnouncement("Write a prompt before saving it.");
      composerRef.current?.focus();
      return;
    }
    const fallbackTitle =
      content.split(/\r?\n/u, 1)[0]?.replace(/\s+/gu, " ").slice(0, 80) ||
      "Saved prompt";
    const title = (promptTitle.trim() || fallbackTitle).slice(0, 80);
    const now = new Date().toISOString();
    setPromptLibrary((current) =>
      [
        {
          id: crypto.randomUUID(),
          title,
          content,
          ...(activeProject && promptScope === "project"
            ? { projectId: activeProject.id }
            : {}),
          createdAt: now,
          updatedAt: now,
        },
        ...current,
      ].slice(0, 50),
    );
    setPromptTitle("");
    setQueueAnnouncement(`Saved “${title}” to the prompt library.`);
  };
  const restorePrompt = (entry: PromptLibraryEntry) => {
    setDraft(entry.content);
    setPromptLibraryOpen(false);
    setQueueAnnouncement(`Restored “${entry.title}”.`);
    requestAnimationFrame(() => composerRef.current?.focus());
  };
  const deletePrompt = (entry: PromptLibraryEntry) => {
    setPromptLibrary((current) =>
      current.filter((candidate) => candidate.id !== entry.id),
    );
    if (editingPromptId === entry.id) {
      setEditingPromptId("");
      setEditingPromptTitle("");
    }
    setQueueAnnouncement(`Deleted “${entry.title}” from the prompt library.`);
  };
  const beginPromptRename = (entry: PromptLibraryEntry) => {
    setEditingPromptId(entry.id);
    setEditingPromptTitle(entry.title);
  };
  const finishPromptRename = () => {
    const title = editingPromptTitle.trim().slice(0, 80);
    if (!editingPromptId || !title) return;
    const now = new Date().toISOString();
    setPromptLibrary((current) =>
      current.map((entry) =>
        entry.id === editingPromptId
          ? { ...entry, title, updatedAt: now }
          : entry,
      ),
    );
    setEditingPromptId("");
    setEditingPromptTitle("");
    setQueueAnnouncement(`Renamed prompt to “${title}”.`);
  };
  const composerValidationError =
    attachmentValidationError ||
    (isCommandMessage(draft.trim()) && attachedFiles.length > 0
      ? "Commands cannot be sent with file context. Remove the attachments or send a normal message."
      : "");
  const canSubmit =
    Boolean(draft.trim()) &&
    backend.phase === "ready" &&
    !composerValidationError;
  const isNewConversation =
    selectedMessages.length === 0 &&
    (selectedSession?.messageCount ?? 0) === 0 &&
    !activeRequest;

  return (
    <div
      className={`chat-workspace ${
        inspectorVisible ? "inspector-open" : "inspector-closed"
      }`}
    >
      <section className="chat-conversation" aria-label="Conversation detail">
        <header className="chat-header">
          <div className="chat-header-content">
            <div
              className={`chat-header-mainline${
                titleInAppChrome ? " title-in-app-chrome" : ""
              }`}
            >
              <div className="chat-header-title-wrap">
                <h2 className={titleInAppChrome ? "sr-only" : undefined}>
                  {selectedSession?.title ?? "New conversation"}
                </h2>
              </div>
              <div className="chat-session-meta-wrap">
                <div className="chat-session-meta">
                  {activeProject && onOpenProjectManager ? (
                    <button
                      className="chat-session-meta-pill chat-project-badge chat-meta-project"
                      onClick={onOpenProjectManager}
                      style={
                        activeProject.color
                          ? ({
                              "--project-color": activeProject.color,
                            } as CSSProperties)
                          : undefined
                      }
                      title={
                        activeProject.primaryPath
                          ? `${activeProject.name} · ${activeProject.primaryPath}`
                          : activeProject.name
                      }
                      type="button"
                    >
                      <i aria-hidden="true" />
                      <span
                        className={titleInAppChrome ? "sr-only" : undefined}
                      >
                        {activeProject.name}
                      </span>
                    </button>
                  ) : activeProject ? (
                    <span
                      className="chat-session-meta-pill chat-project-badge chat-meta-project"
                      style={
                        activeProject.color
                          ? ({
                              "--project-color": activeProject.color,
                            } as CSSProperties)
                          : undefined
                      }
                      title={
                        activeProject.primaryPath
                          ? `${activeProject.name} · ${activeProject.primaryPath}`
                          : activeProject.name
                      }
                    >
                      <i aria-hidden="true" />
                      <span
                        className={titleInAppChrome ? "sr-only" : undefined}
                      >
                        {activeProject.name}
                      </span>
                    </span>
                  ) : null}
                  <button
                    aria-pressed={Boolean(selectedSession?.pinned)}
                    className={`chat-session-meta-pill chat-meta-pin ${
                      selectedSession?.pinned ? "selected" : ""
                    }`.trim()}
                    onClick={() => togglePin(selectedId)}
                    type="button"
                  >
                    {selectedSession?.pinned ? "Pinned" : "Pin"}
                  </button>
                  {selectedSession?.parentSessionId ? (
                    <span
                      className="chat-session-meta-pill chat-meta-branch"
                      title={`Forked from ${selectedSession.parentSessionId}`}
                    >
                      Branch
                    </span>
                  ) : null}
                  <span className="chat-session-meta-pill chat-meta-count">
                    {selectedMessageCount.toLocaleString()} messages
                  </span>
                  <button
                    className="chat-session-meta-pill chat-meta-workspace"
                    onClick={() => onOpenWorkspaceView("code")}
                    title={workspacePath || "Open the current coding workspace"}
                    type="button"
                  >
                    {titleInAppChrome
                      ? "Code"
                      : workspacePath
                        ? `Workspace · ${fileName(workspacePath)}`
                        : "Open workspace"}
                  </button>
                  <span className="chat-session-meta-pill chat-meta-updated">
                    {selectedUpdatedAt
                      ? `Updated ${displayTimestamp(selectedUpdatedAt)}`
                      : "Not started"}
                  </span>
                  <span
                    className={`chat-session-meta-pill chat-meta-context context-${selectedContextTone}`}
                  >
                    {selectedContext
                      ? `${Math.round(selectedContextPercent)}% context`
                      : selectedUsageError
                        ? "Context unavailable"
                        : "Fresh context"}
                  </span>
                  {selectedContextPercent >= 70 ? (
                    <button
                      className="chat-session-meta-pill context-action"
                      onClick={() => {
                        setDraft((current) =>
                          current.trim() ? current : "/compress ",
                        );
                        requestAnimationFrame(() =>
                          composerRef.current?.focus(),
                        );
                      }}
                      title="Prepare a context-compression command"
                      type="button"
                    >
                      Compress context
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="chat-header-top-actions">
                <button
                  aria-label={`Open route controls. Current route ${modelRouteLabel}.`}
                  className="chat-model-route"
                  onClick={() => setRouteDialogOpen(true)}
                  type="button"
                >
                  <span>Route</span>
                  <strong>{modelRouteLabel}</strong>
                </button>
                <button
                  aria-controls="mobile-conversations"
                  aria-expanded={mobileConversationsOpen}
                  className="chat-mobile-conversations-button secondary-button"
                  onClick={() => setMobileConversationsOpen(true)}
                  ref={mobileConversationsButtonRef}
                  type="button"
                >
                  <span>History</span>
                  <small>{sessions.length}</small>
                </button>
                {activeRequest ? (
                  <button
                    className="secondary-button"
                    onClick={() =>
                      void window.doolittle.cancelChat(activeRequest)
                    }
                    type="button"
                  >
                    Stop response
                  </button>
                ) : null}
                <button
                  aria-controls="thread-workbench"
                  aria-expanded={inspectorVisible}
                  className={`secondary-button chat-workbench-toggle ${
                    inspectorVisible ? "selected" : ""
                  }`}
                  onClick={toggleInspector}
                  type="button"
                >
                  <span aria-hidden="true">◧</span>
                  Workbench
                </button>
              </div>
            </div>
          </div>
        </header>
        <div className="chat-messages">
          {loadingHistory === selectedId ? (
            <div className="chat-loading">
              <i />
              Loading conversation…
            </div>
          ) : historyError ? (
            <EmptyBlock title="Conversation unavailable">
              {historyError}
            </EmptyBlock>
          ) : selectedMessages.length ? (
            selectedMessages.map((message) => {
              const requestId = message.id.startsWith("assistant:")
                ? message.id.slice("assistant:".length)
                : "";
              const receipt = requestId ? runReceipts[requestId] : undefined;
              const parsedAgentMessage =
                message.role === "assistant" && message.content
                  ? parseAgentMessage(message.content)
                  : undefined;
              const hasToolActivity = Boolean(parsedAgentMessage?.tools.length);
              const receiptNeedsAttention = Boolean(
                receipt &&
                  (receipt.latest.run.pendingApprovals > 0 ||
                    receipt.latest.run.errorMessage ||
                    receipt.latest.run.status === "error" ||
                    receipt.latest.run.status === "cancelled"),
              );
              const showRunReceipt = Boolean(
                receipt &&
                  (receiptNeedsAttention ||
                    (!hasToolActivity &&
                      (message.pending ||
                        receipt.latest.run.localMutations.length > 0))),
              );
              return (
                <article
                  className={`chat-message ${message.role} ${
                    message.error ? "error" : ""
                  }`}
                  key={message.id}
                >
                  <div className="chat-message-label">
                    <strong>
                      <span aria-hidden="true" className="chat-message-avatar">
                        {message.role === "assistant" ? "D" : "Y"}
                      </span>
                      <span>
                        {message.role === "assistant" ? "Doolittle" : "You"}
                      </span>
                    </strong>
                    <time>{displayTimestamp(message.createdAt)}</time>
                  </div>
                  <div className="chat-message-body">
                    {receipt && showRunReceipt ? (
                      <RunReceiptView
                        pending={Boolean(message.pending)}
                        receipt={receipt}
                      />
                    ) : null}
                    {message.content ? (
                      <MessageContent
                        content={message.content}
                        parsedAgentMessage={parsedAgentMessage}
                        pending={message.pending}
                        separateAgentEvents={message.role === "assistant"}
                      />
                    ) : message.pending && !receipt ? (
                      <span className="thinking">Thinking</span>
                    ) : null}
                    {message.attachments?.length ? (
                      <ul
                        aria-label="Message attachments"
                        className="chat-message-attachments"
                      >
                        {message.attachments.map((attachment) => (
                          <li key={attachment.id}>
                            <span
                              aria-hidden="true"
                              className="chat-message-attachment-icon"
                            >
                              {attachment.kind === "image" ? "◫" : "◇"}
                            </span>
                            <span className="chat-message-attachment-copy">
                              <strong>{attachment.name}</strong>
                              <small>
                                {attachment.kind} ·{" "}
                                {attachmentSize(attachment.sizeBytes)}
                              </small>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {message.role === "user" && message.memoryMatch ? (
                      <p className="chat-message-memory-source">
                        {message.memoryMatch.count > 0
                          ? `${message.memoryMatch.count} saved profile ${
                              message.memoryMatch.count === 1
                                ? "match"
                                : "matches"
                            } available to this turn`
                          : "No saved profile matches for this turn"}
                      </p>
                    ) : null}
                    {renderMessageActions(message)}
                  </div>
                </article>
              );
            })
          ) : (
            <Welcome onSelect={setDraft} projectName={activeProject?.name} />
          )}
          {progress ? (
            <div className="chat-progress">
              <i />
              {progress}
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
        <div aria-live="polite" className="sr-only" role="status">
          {accessibilityStatus}
        </div>
        <form className="chat-composer" onSubmit={submit}>
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
                    <small>
                      {command.disabledReason ?? command.description}
                    </small>
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
                    No saved prompts in this scope. Write a draft and save it
                    here for reuse.
                  </p>
                )}
              </section>
            ) : null}
            <ComposerModelSelector
              active={backend.phase === "ready"}
              onOpenModelsPage={onOpenModelsPage}
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
                void submit();
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
            {activeRequest ? "Enter to queue" : "Enter to send"} · Shift Enter
            for a new line
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
      </section>
      {mobileConversationsOpen ? (
        <div className="chat-mobile-conversations-backdrop">
          <button
            aria-label="Close conversations"
            className="chat-mobile-conversations-dismiss"
            onClick={() => setMobileConversationsOpen(false)}
            type="button"
          />
          <div
            aria-label="Conversations"
            aria-modal="true"
            className="chat-mobile-conversations-dialog"
            id="mobile-conversations"
            ref={mobileConversationsDialogRef}
            role="dialog"
          >
            <header>
              <div>
                <span className="eyebrow">
                  {activeProject?.name ?? "Workspace"}
                </span>
                <h2>Conversations</h2>
              </div>
              <button
                aria-label="Close conversations"
                className="icon-button"
                onClick={() => setMobileConversationsOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <input
              aria-label="Search conversations"
              onChange={(event) => setSessionSearch(event.target.value)}
              placeholder="Search conversations"
              type="search"
              value={sessionSearch}
            />
            <div className="chat-mobile-conversations-list">
              {sessions.map((session) => (
                <button
                  aria-current={
                    session.sessionId === selectedId ? "page" : undefined
                  }
                  data-mobile-conversation
                  key={session.sessionId}
                  onClick={() => {
                    onSelect(session.sessionId);
                    setMobileConversationsOpen(false);
                  }}
                  type="button"
                >
                  <strong>{session.title || "Untitled conversation"}</strong>
                  <span>
                    {session.messageCount} messages ·{" "}
                    {displayTimestamp(session.endedAt)}
                    {projectLabels
                      ? ` · ${
                          session.projectId
                            ? (projectLabels[session.projectId] ?? "Project")
                            : "Unscoped"
                        }`
                      : ""}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="new-chat-button"
              onClick={() => {
                if (onRequestNewConversation) onRequestNewConversation();
                else createConversation();
                setMobileConversationsOpen(false);
              }}
              type="button"
            >
              <span>＋</span> New conversation
            </button>
          </div>
        </div>
      ) : null}
      {inspectorVisible ? (
        <div id="thread-workbench">
          <ThreadWorkbenchRail
            active={backend.phase === "ready"}
            onInsertContext={insertChatContext}
            onOpenFullView={onOpenWorkspaceView}
            onRequestClose={() => setInspectorVisible(false)}
            sessionId={selectedId}
            workspacePath={workspacePath}
          />
        </div>
      ) : null}
      <RouteControlDialog
        isOpen={routeDialogOpen}
        onClose={() => setRouteDialogOpen(false)}
        onOpenModelsPage={() => {
          setRouteDialogOpen(false);
          onOpenModelsPage();
        }}
        refreshRuntime={refreshRuntime}
        runtime={runtime}
      />
    </div>
  );
}
