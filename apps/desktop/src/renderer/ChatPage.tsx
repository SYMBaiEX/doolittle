import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BackendState,
  ChatEvent,
  DesktopRunUpdate,
  ManagedAttachmentDescriptor,
  RuntimeStatus,
  SavedProfileRecallResponse,
  SessionMessagesResponse,
  SessionSummary,
  SessionUsageSummary,
} from "../shared/contracts";
import { InlineApprovalPanel } from "./components/InlineApprovalPanel";
import { MessageContent } from "./components/MessageContent";
import { RouteControlDialog } from "./components/RouteControlDialog";
import {
  type ThreadWorkbenchFullView,
  ThreadWorkbenchRail,
} from "./components/ThreadWorkbenchRail";
import {
  type ContextPressureSnapshot,
  clampContextPercent,
  contextPressureLabel,
  contextPressureTone,
} from "./context-pressure";
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
interface ConversationPins {
  [sessionId: string]: boolean;
}

interface SessionForRender extends SessionSummary {
  pinned: boolean;
}

interface QueuedMessage {
  id: string;
  sessionId: string;
  content: string;
  attachments: ManagedAttachmentDescriptor[];
  memoryMatch?: MemoryMatchSnapshot;
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

interface OperatorShortcut {
  command: string;
  label: string;
  detail: string;
  behavior?: "draft";
}

const STORAGE_KEY = "doolittle.desktop.conversations.v2";
const PIN_STORAGE_KEY = "doolittle.desktop.conversation.pins.v1";
const INSPECTOR_STORAGE_KEY = "doolittle.desktop.chat-inspector-visible.v1";
const MAX_MESSAGE_ATTACHMENTS = 8;
const MAX_MESSAGE_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MEMORY_MATCH_DEBOUNCE_MS = 380;
const OPERATOR_SHORTCUTS: OperatorShortcut[] = [
  {
    command: "/status",
    label: "Status",
    detail: "Runtime readiness",
  },
  {
    command: "/usage",
    label: "Usage",
    detail: "Context pressure",
  },
  {
    command: "/insights",
    label: "Insights",
    detail: "Session signals",
  },
  {
    command: "/model",
    label: "Model",
    detail: "Provider routes",
  },
  {
    command: "/retry",
    label: "Retry",
    detail: "Regenerate last turn",
  },
  {
    command: "/compress ",
    label: "Compress",
    detail: "Summarize context",
    behavior: "draft",
  },
  {
    command: "/undo",
    label: "Undo",
    detail: "Remove last exchange",
    behavior: "draft",
  },
];

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

function loadConversationPins(): ConversationPins {
  try {
    const value = localStorage.getItem(PIN_STORAGE_KEY);
    if (!value) return {};
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(([, isPinned]) => Boolean(isPinned)),
    ) as ConversationPins;
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
  return value.split(/[/\\]+/u).pop() ?? value;
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
    <details className="chat-run-receipt" open={pending}>
      <summary>
        <span className={`chat-run-state ${tone}`} aria-hidden="true" />
        <span>
          <strong>Agent run</strong>
          <small>{summary}</small>
        </span>
        <span className="chat-run-metrics">
          {latest.run.observedActionCount} actions ·{" "}
          {latest.run.localMutations.length} changes
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

function Welcome({ onSelect }: { onSelect: (prompt: string) => void }) {
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
        Think through a decision, investigate a system, or turn an unfinished
        idea into working software.
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
  const [draft, setDraft] = useState("");
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
  const [pinnedSessions, setPinnedSessions] = useState(loadConversationPins);
  const [sessionSearch, setSessionSearch] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<
    ManagedAttachmentDescriptor[]
  >([]);
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const [queueAnnouncement, setQueueAnnouncement] = useState("");
  const [runReceipts, setRunReceipts] = useState<RunReceiptStore>({});
  const [copyStates, setCopyStates] = useState<Record<string, CopyState>>({});
  const [sessionUsage, setSessionUsage] = useState<
    Record<string, ContextPressureSnapshot>
  >({});
  const [usageLoading, setUsageLoading] = useState("");
  const [usageErrors, setUsageErrors] = useState<Record<string, string>>({});
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  const sessionButtonRefs = useRef<Record<string, HTMLButtonElement | null>>(
    {},
  );
  const requestSession = useRef<Record<string, string>>({});
  const requestedHistory = useRef(new Set<string>());
  const chatHandler = useRef<(event: ChatEvent) => void>(() => {});
  const memoryRecallSequence = useRef(0);

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

  const insertChatContext = useCallback((text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    setDraft((current) =>
      current.trim() ? `${current}\n\n${normalized}` : normalized,
    );
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!selectedId) onSelect(initialId);
  }, [initialId, onSelect, selectedId]);

  useEffect(() => {
    void refreshSessionUsage(selectedId);
  }, [refreshSessionUsage, selectedId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pinnedSessions));
  }, [pinnedSessions]);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: switching conversations should clear attached local context immediately when selectedId changes.
  useEffect(() => {
    setAttachedFiles([]);
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
      byId.set(sessionId, {
        sessionId,
        title:
          byId.get(sessionId)?.title ??
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

  const renderCopyButton = (message: DisplayMessage): ReactNode => {
    const copyState = copyStates[message.id];
    const label = copyState === "copied" ? "Copied" : "Copy";
    const failed = copyState === "failed";
    return (
      <button
        aria-label={failed ? "Copy failed" : "Copy message"}
        className="chat-message-copy"
        onClick={() => void copyMessage(message.id, message.content)}
        type="button"
      >
        {failed ? "Copy failed" : label}
      </button>
    );
  };

  const sendMessage = async (
    input: string,
    attachments = attachedFiles,
    sessionId = selectedId,
    clearComposer = true,
    memoryMatchOverride?: MemoryMatchSnapshot,
  ) => {
    const content = input.trim();
    if (!content || !sessionId || activeRequest || backend.phase !== "ready") {
      return;
    }

    if (isCommandMessage(content) && attachments.length > 0) {
      setQueueAnnouncement(
        "Remove message attachments before running a command.",
      );
      return;
    }
    const messageAttachments = attachments;
    const memoryMatch =
      memoryMatchOverride ?? freezeMemoryMatchSnapshot(content, memoryMatches);
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
      });
    } catch (error) {
      if (!requestSession.current[requestId]) return;
      updateAssistant(sessionId, requestId, (message) => ({
        ...message,
        content: errorMessage(error),
        pending: false,
        error: true,
      }));
      finishRequest(requestId);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: sendMessage intentionally consumes the current request state after each queue transition.
  useEffect(() => {
    if (
      activeRequest ||
      backend.phase !== "ready" ||
      queuedMessages.length === 0
    ) {
      return;
    }
    const [next, ...remaining] = queuedMessages;
    if (!next) return;
    setQueuedMessages(remaining);
    void sendMessage(
      next.content,
      next.attachments,
      next.sessionId,
      false,
      next.memoryMatch,
    );
  }, [activeRequest, backend.phase, queuedMessages]);

  const queueCurrentDraft = () => {
    const content = draft.trim();
    if (!content || !selectedId) return;
    if (isCommandMessage(content) && attachedFiles.length > 0) {
      setQueueAnnouncement(
        "Remove message attachments before queueing a command.",
      );
      return;
    }
    setQueuedMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        sessionId: selectedId,
        content,
        attachments: attachedFiles,
        memoryMatch: freezeMemoryMatchSnapshot(content, memoryMatches),
      },
    ]);
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

  const runOperatorShortcut = (shortcut: OperatorShortcut) => {
    if (shortcut.behavior === "draft") {
      setDraft(shortcut.command);
      requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }
    void sendMessage(shortcut.command, []);
  };

  const createConversation = () => {
    const id = newConversationId();
    setMessages((current) => ({ ...current, [id]: [] }));
    onSelect(id);
    setDraft("");
  };

  const togglePin = (sessionId: string) => {
    setPinnedSessions((current) => {
      const next = { ...current };
      if (next[sessionId]) {
        delete next[sessionId];
      } else {
        next[sessionId] = true;
      }
      return next;
    });
  };

  const focusSessionAt = useCallback(
    (index: number) => {
      const target = sessions[index];
      if (!target) return;
      requestAnimationFrame(() => {
        sessionButtonRefs.current[target.sessionId]?.focus();
      });
    },
    [sessions],
  );

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
        setQueueAnnouncement(
          `Attachment limit reached. Up to ${MAX_MESSAGE_ATTACHMENTS} files and 50 MB total are allowed.`,
        );
      }
    } catch {
      // optional: file picker failed; keep local context unchanged
    }
  };

  const removeContextFile = (id: string) => {
    setAttachedFiles((current) => current.filter((entry) => entry.id !== id));
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

  return (
    <div
      className={`chat-workspace ${
        inspectorVisible ? "inspector-open" : "inspector-closed"
      }`}
    >
      <aside className="chat-sessions" aria-label="Conversations">
        <div className="chat-sessions-heading">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2>Conversations</h2>
          </div>
          <button
            aria-label="New conversation"
            className="icon-button"
            onClick={createConversation}
            type="button"
          >
            +
          </button>
        </div>
        <input
          aria-label="Search conversations"
          className="chat-session-search"
          onChange={(event) => setSessionSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusSessionAt(0);
            }
          }}
          placeholder="Search conversations"
          type="search"
          value={sessionSearch}
        />
        <div className="chat-session-list">
          {sessions.map((session) => (
            <div
              className={`chat-session-row ${
                session.sessionId === selectedId ? "selected" : ""
              } ${session.pinned ? "pinned" : ""}`.trim()}
              key={session.sessionId}
            >
              <button
                aria-label={`Open conversation ${
                  session.title || session.preview?.[0] || "New conversation"
                }`}
                className={`chat-session-item ${
                  session.sessionId === selectedId ? "selected" : ""
                }`.trim()}
                onKeyDown={(event) => {
                  const index = sessions.findIndex(
                    (entry) => entry.sessionId === session.sessionId,
                  );
                  if (index === -1) return;
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    focusSessionAt(Math.min(index + 1, sessions.length - 1));
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    focusSessionAt(Math.max(index - 1, 0));
                  }
                  if (event.key === "Home") {
                    event.preventDefault();
                    focusSessionAt(0);
                  }
                  if (event.key === "End") {
                    event.preventDefault();
                    focusSessionAt(sessions.length - 1);
                  }
                }}
                onClick={() => onSelect(session.sessionId)}
                ref={(element) => {
                  sessionButtonRefs.current[session.sessionId] = element;
                }}
                type="button"
              >
                <strong>
                  {session.title ||
                    session.preview?.[0] ||
                    "Untitled conversation"}
                </strong>
                <span>
                  {session.messageCount} messages ·{" "}
                  {displayTimestamp(session.endedAt)}
                </span>
              </button>
              <button
                aria-pressed={session.pinned}
                aria-label={
                  session.pinned
                    ? `Unpin conversation ${session.title || session.sessionId}`
                    : `Pin conversation ${session.title || session.sessionId}`
                }
                className="chat-session-pin"
                onClick={() => togglePin(session.sessionId)}
                type="button"
              >
                {session.pinned ? "Unpin" : "Pin"}
              </button>
            </div>
          ))}
        </div>
        <button
          className="new-chat-button"
          onClick={createConversation}
          type="button"
        >
          <span>＋</span> New conversation
        </button>
      </aside>
      <section className="chat-conversation" aria-label="Conversation detail">
        <header className="chat-header">
          <div>
            <span className="eyebrow">Conversation</span>
            <h2>{selectedSession?.title ?? "New conversation"}</h2>
            <button
              aria-label={`Open route controls. Current route ${modelRouteLabel}.`}
              className="chat-model-route"
              onClick={() => setRouteDialogOpen(true)}
              type="button"
            >
              <span>Route</span>
              <strong>{modelRouteLabel}</strong>
            </button>
            <div className="chat-session-meta">
              <button
                aria-pressed={Boolean(selectedSession?.pinned)}
                className={`chat-session-meta-pill ${
                  selectedSession?.pinned ? "selected" : ""
                }`.trim()}
                onClick={() => togglePin(selectedId)}
                type="button"
              >
                {selectedSession?.pinned ? "Pinned" : "Pin"}
              </button>
              <span className="chat-session-meta-pill">
                {selectedMessageCount.toLocaleString()} messages
              </span>
              <button
                className="chat-session-meta-pill"
                onClick={() => onOpenWorkspaceView("code")}
                title={workspacePath || "Open the current coding workspace"}
                type="button"
              >
                {workspacePath
                  ? `Workspace · ${fileName(workspacePath)}`
                  : "Open workspace"}
              </button>
              <span className="chat-session-meta-pill">
                {selectedUpdatedAt
                  ? `Updated ${displayTimestamp(selectedUpdatedAt)}`
                  : "Not started"}
              </span>
              <span
                className={`chat-session-meta-pill context-${selectedContextTone}`}
              >
                {selectedContext
                  ? `${Math.round(selectedContextPercent)}% context`
                  : selectedUsageError
                    ? "Context unavailable"
                    : "Fresh context"}
              </span>
            </div>
            <label className="chat-mobile-session-picker">
              <span className="sr-only">Switch conversation</span>
              <select
                aria-label="Switch conversation"
                onChange={(event) => onSelect(event.target.value)}
                value={selectedId}
              >
                {sessions.map((session) => (
                  <option key={session.sessionId} value={session.sessionId}>
                    {session.title || "Untitled conversation"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="chat-header-toolbar">
            {activeRequest ? (
              <button
                className="secondary-button"
                onClick={() => void window.doolittle.cancelChat(activeRequest)}
                type="button"
              >
                Stop response
              </button>
            ) : (
              <Badge tone={backend.phase === "ready" ? "good" : "warn"}>
                {backend.phase === "ready" ? "Runtime ready" : backend.phase}
              </Badge>
            )}
            <button
              aria-controls="thread-workbench"
              aria-expanded={inspectorVisible}
              className="secondary-button"
              onClick={toggleInspector}
              type="button"
            >
              {inspectorVisible ? "Hide workbench" : "Show workbench"}
            </button>
          </div>
        </header>
        <div
          aria-label="Session controls"
          className="chat-operator-strip"
          role="toolbar"
        >
          <span className="chat-operator-label">
            <i className="chat-operator-dot" />
            Session tools
          </span>
          <div className="chat-operator-actions">
            {OPERATOR_SHORTCUTS.map((shortcut) => (
              <button
                className={shortcut.command === "/undo" ? "danger" : ""}
                disabled={
                  backend.phase !== "ready" ||
                  Boolean(activeRequest) ||
                  (shortcut.command === "/retry" &&
                    selectedMessages.length === 0)
                }
                key={shortcut.command}
                onClick={() => runOperatorShortcut(shortcut)}
                title={shortcut.detail}
                type="button"
              >
                {shortcut.label}
              </button>
            ))}
          </div>
          <button
            className="chat-operator-all"
            disabled={backend.phase !== "ready" || Boolean(activeRequest)}
            onClick={() => void sendMessage("/commands", [])}
            title="Browse every Doolittle command"
            type="button"
          >
            All commands
          </button>
        </div>
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
              return (
                <article
                  className={`chat-message ${message.role} ${
                    message.error ? "error" : ""
                  }`}
                  key={message.id}
                >
                  <div className="chat-message-label">
                    <strong>
                      {message.role === "assistant" ? "Doolittle" : "You"}
                    </strong>
                    <time>{displayTimestamp(message.createdAt)}</time>
                  </div>
                  <div className="chat-message-body">
                    {receipt ? (
                      <RunReceiptView
                        pending={Boolean(message.pending)}
                        receipt={receipt}
                      />
                    ) : null}
                    {message.content ? (
                      <MessageContent content={message.content} />
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
                    {renderCopyButton(message)}
                  </div>
                </article>
              );
            })
          ) : (
            <Welcome onSelect={setDraft} />
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
          <InlineApprovalPanel active={backend.phase === "ready"} />
          {queuedMessages.length > 0 ? (
            <div className="chat-message-queue" ref={queueRef}>
              <div className="chat-message-queue-heading">
                <strong>
                  {queuedMessages.length} queued{" "}
                  {queuedMessages.length === 1 ? "message" : "messages"}
                </strong>
                <button onClick={clearQueuedMessages} type="button">
                  Clear queue
                </button>
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
          <button
            aria-label="Attach file context"
            className="secondary-button"
            onClick={pickContextFiles}
            type="button"
          >
            + Files
          </button>
          <textarea
            aria-label="Message Doolittle"
            disabled={backend.phase !== "ready"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={
              backend.phase === "ready"
                ? "Message Doolittle…"
                : "Waiting for the local runtime…"
            }
            ref={composerRef}
            rows={1}
            value={draft}
          />
          <button
            aria-label={activeRequest ? "Queue message" : "Send message"}
            disabled={!draft.trim() || backend.phase !== "ready"}
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
          <small>
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
            <span className="chat-context-track" aria-hidden="true">
              <i
                className="chat-context-fill"
                style={{ width: `${selectedContextPercent}%` }}
              />
            </span>
            <span>
              <strong>Est. context</strong>
              <small>
                {selectedContext
                  ? contextPressureLabel(selectedContext)
                  : usageLoading === selectedId
                    ? "Measuring…"
                    : selectedUsageError
                      ? "Unavailable"
                      : "0% · new session"}
              </small>
            </span>
          </div>
        </form>
      </section>
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
