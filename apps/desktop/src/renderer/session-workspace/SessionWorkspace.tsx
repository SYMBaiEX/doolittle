import { useMediaQuery } from "@elizaos/ui/hooks/useMediaQuery";
import { ArrowLeft, ArrowRight, Columns2, Plus, Search, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SessionSummary } from "../../shared/contracts";
import type { ChatPageProps } from "../ChatPage";
import type { ConversationStore, RunReceiptStore } from "../chat/models";
import { loadStoredChatMessages } from "../chat/useChatConversationState";
import { Button, Input } from "../components/ElizaControls";
import { newConversationId } from "../conversation-id";
import {
  type ConversationDraft,
  loadConversationDrafts,
  loadConversationQueue,
  type PersistedQueuedMessage,
  safeSetStorageItem,
} from "../conversation-persistence";
import {
  ChatWorkspaceProvider,
  useWorkspaceState,
} from "./chat-workspace-store";
import { sessionPanelStatus } from "./session-status";
import {
  closeWorkspaceSession,
  LEGACY_SESSION_WORKSPACE_STORAGE_KEY,
  MAX_OPEN_PANELS,
  moveWorkspaceSession,
  openWorkspaceSession,
  resizeWorkspaceSplit,
  restoreWorkspaceLayout,
  retainWorkspacePanels,
  SESSION_WORKSPACE_STORAGE_KEY,
  splitWorkspaceSession,
  workspaceGeometry,
  workspaceRequiredSize,
} from "./workspace-layout";

type PanelProps = ChatPageProps & {
  coordinator: boolean;
  focused: boolean;
  visible: boolean;
};
type WorkspaceProps = ChatPageProps & {
  renderPanel: (props: PanelProps) => ReactNode;
};
const CONTROL =
  "inline-flex min-h-9 min-w-9 max-[720px]:min-h-11 max-[720px]:min-w-11 items-center justify-center gap-1.5 border border-[var(--border)] px-2 text-[length:var(--text-control)] text-[var(--text-soft)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40";

export function SessionWorkspace(props: WorkspaceProps) {
  return (
    <ChatWorkspaceProvider>
      <SessionWorkspaceContent {...props} />
    </ChatWorkspaceProvider>
  );
}

function SessionWorkspaceContent({ renderPanel, ...props }: WorkspaceProps) {
  const [layout, setLayout] = useState(() => {
    try {
      return restoreWorkspaceLayout(
        localStorage.getItem(SESSION_WORKSPACE_STORAGE_KEY) ??
          localStorage.getItem(LEGACY_SESSION_WORKSPACE_STORAGE_KEY),
        props.selectedId,
      );
    } catch {
      return restoreWorkspaceLayout(null, props.selectedId);
    }
  });
  const [finderOpen, setFinderOpen] = useState(false);
  const [retainedIds, setRetainedIds] = useState(layout.openIds);
  const visitedIds = useRef(new Set(layout.openIds));
  for (const id of layout.openIds) visitedIds.current.add(id);
  const mountedIds = retainWorkspacePanels(retainedIds, layout.openIds);
  const [search, setSearch] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [layoutWarning, setLayoutWarning] = useState("");
  const [activeRequests] = useWorkspaceState<Record<string, string>>(
    "run.active-requests",
    {},
  );
  const [receipts] = useWorkspaceState<RunReceiptStore>("run.receipts", {});
  const [queuedMessages] = useWorkspaceState<PersistedQueuedMessage[]>(
    "run.queue",
    () => loadConversationQueue(localStorage),
  );
  const [queuePaused] = useWorkspaceState(
    "run.queue-paused",
    () => queuedMessages.length > 0,
  );
  const [messages] = useWorkspaceState<ConversationStore>(
    "conversation.messages",
    () => loadStoredChatMessages(localStorage),
  );
  const [drafts] = useWorkspaceState<Record<string, ConversationDraft>>(
    "conversation.drafts",
    () => loadConversationDrafts(localStorage),
  );
  const isNarrow = useMediaQuery("(max-width: 900px)");
  const rootRef = useRef<HTMLElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  const requiredSize = workspaceRequiredSize(layout.tree);
  const tabbed =
    isNarrow ||
    layout.mode === "tabs" ||
    (panelSize.width > 0 && panelSize.width < requiredSize.width) ||
    (panelSize.height > 0 && panelSize.height < requiredSize.height);
  const geometry = workspaceGeometry(layout.tree);
  const searchRef = useRef<HTMLInputElement>(null);
  const finderButtonRef = useRef<HTMLButtonElement>(null);
  const focusRequestedRef = useRef(false);
  const externalSelectionRef = useRef(props.selectedId);
  useEffect(() => {
    const element = panelsRef.current;
    if (!element) return;
    const update = () =>
      setPanelSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const knownSessions = useRef(new Map<string, SessionSummary>());
  for (const session of [
    ...(props.sessionMetadata ?? []),
    ...props.remoteSessions,
  ])
    knownSessions.current.set(session.sessionId, session);
  const panelSessions = [...knownSessions.current.values()];
  const ids = [
    ...new Set([
      ...props.remoteSessions.map((session) => session.sessionId),
      ...Object.keys(messages),
      ...Object.keys(drafts),
      ...Object.keys(activeRequests),
      ...layout.openIds,
      ...retainedIds,
      ...visitedIds.current,
    ]),
  ];
  const titleFor = (id: string) =>
    knownSessions.current.get(id)?.title ||
    messages[id]
      ?.find((message) => message.role === "user")
      ?.content.slice(0, 48) ||
    "New session";
  const statusFor = (id: string) =>
    sessionPanelStatus({
      sessionId: id,
      activeRequest: activeRequests[id],
      receipts,
      backendPhase: props.backend.phase,
      queuedCount: queuedMessages.filter((message) => message.sessionId === id)
        .length,
      queuePaused,
      messages: messages[id],
    });
  const botScopeFor = (id: string) => {
    const ownerId = props.botIdForSession?.(id) || props.defaultBotId;
    const owner = props.bots?.find((bot) => bot.id === ownerId);
    if (!owner || owner.isDefault) {
      return {
        workspacePath: props.workspacePath,
        activeProject: props.activeProject,
      };
    }
    const ownerProject = owner?.projectId
      ? props.projects?.find((project) => project.id === owner.projectId)
      : undefined;
    return {
      workspacePath: owner.workspacePath,
      activeProject: ownerProject ?? null,
    };
  };

  const focusSession = useCallback(
    (id: string, restoreFocus = false) => {
      if (
        !layout.openIds.includes(id) &&
        layout.openIds.length >= MAX_OPEN_PANELS
      ) {
        setAnnouncement(
          `Up to ${MAX_OPEN_PANELS} panels can be open. Close a view before opening another; its draft and run are retained.`,
        );
        return;
      }
      setLayout((current) => openWorkspaceSession(current, id));
      focusRequestedRef.current = restoreFocus;
      if (restoreFocus && id === layout.focusedId) {
        focusRequestedRef.current = false;
        requestAnimationFrame(() => {
          const panel = rootRef.current?.querySelector<HTMLElement>(
            `[data-session-panel="${id}"]`,
          );
          (
            panel?.querySelector<HTMLTextAreaElement>("textarea") ?? panel
          )?.focus({ preventScroll: true });
        });
      }
      props.onSelect(id);
      setFinderOpen(false);
    },
    [layout.openIds, layout.focusedId, props.onSelect],
  );

  useEffect(() => {
    if (externalSelectionRef.current === props.selectedId) return;
    externalSelectionRef.current = props.selectedId;
    if (
      !layout.openIds.includes(props.selectedId) &&
      layout.openIds.length >= MAX_OPEN_PANELS
    ) {
      setAnnouncement(
        `Up to ${MAX_OPEN_PANELS} panels can be open. Close a view before opening the selected session; its draft and run are retained.`,
      );
      if (layout.focusedId) props.onSelect(layout.focusedId);
      return;
    }
    setLayout((current) => openWorkspaceSession(current, props.selectedId));
  }, [props.selectedId, props.onSelect, layout.focusedId, layout.openIds]);

  useEffect(() => {
    setRetainedIds((current) => {
      const next = retainWorkspacePanels(current, layout.openIds);
      return next.length === current.length &&
        next.every((id, index) => id === current[index])
        ? current
        : next;
    });
  }, [layout.openIds]);

  useEffect(() => {
    const saved = safeSetStorageItem(
      localStorage,
      SESSION_WORKSPACE_STORAGE_KEY,
      JSON.stringify(layout),
    );
    setLayoutWarning(
      saved
        ? ""
        : "Panel layout could not be saved. Your sessions and drafts remain available.",
    );
  }, [layout]);

  useEffect(() => {
    if (!focusRequestedRef.current) return;
    focusRequestedRef.current = false;
    const panel = rootRef.current?.querySelector<HTMLElement>(
      `[data-session-panel="${layout.focusedId}"]`,
    );
    (panel?.querySelector<HTMLTextAreaElement>("textarea") ?? panel)?.focus({
      preventScroll: true,
    });
  }, [layout.focusedId]);

  useEffect(() => {
    if (finderOpen) searchRef.current?.focus();
  }, [finderOpen]);

  useEffect(() => {
    const openFinder = () => setFinderOpen(true);
    window.addEventListener("doolittle:find-session", openFinder);
    return () =>
      window.removeEventListener("doolittle:find-session", openFinder);
  }, []);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        rootRef.current?.closest("[hidden], [inert]") ||
        !(event.metaKey || event.ctrlKey) ||
        !event.shiftKey ||
        event.altKey ||
        event.isComposing ||
        (props.surface ?? "conversation") !== "conversation"
      )
        return;
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        setFinderOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [props.surface]);

  const closePanel = (id: string) => {
    const next = closeWorkspaceSession(layout, id);
    setLayout(next);
    if (next.focusedId) props.onSelect(next.focusedId);
    setAnnouncement(
      "Panel closed. Its draft, history, and any active run are retained. Reopen it with Find session.",
    );
    requestAnimationFrame(() => {
      const target = rootRef.current?.querySelector<HTMLElement>(
        `[data-session-focus="${next.focusedId}"]`,
      );
      const panel = rootRef.current?.querySelector<HTMLElement>(
        `[data-session-panel="${next.focusedId}"]`,
      );
      (
        target ??
        panel?.querySelector<HTMLElement>("textarea") ??
        finderButtonRef.current
      )?.focus({ preventScroll: true });
    });
  };

  useEffect(() => {
    const closeFocused = () => {
      if (layout.focusedId) closePanel(layout.focusedId);
    };
    window.addEventListener("doolittle:close-conversation-view", closeFocused);
    return () =>
      window.removeEventListener(
        "doolittle:close-conversation-view",
        closeFocused,
      );
  });

  const createSession = () => {
    if (layout.openIds.length >= MAX_OPEN_PANELS) {
      setAnnouncement(
        `Close a panel before opening another. The ${MAX_OPEN_PANELS}-panel limit only affects views.`,
      );
      return;
    }
    const id = newConversationId();
    if (props.selectedBotId) props.onBindSessionBot?.(id, props.selectedBotId);
    focusSession(id, true);
  };

  const focusedSession = layout.focusedId || props.selectedId;
  const conversationSurface =
    (props.surface ?? "conversation") === "conversation";

  return (
    <section
      aria-label="Session workbench"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--bg)]"
      ref={rootRef}
      data-session-workbench
    >
      {renderPanel({
        ...props,
        ...botScopeFor(focusedSession),
        remoteSessions: panelSessions,
        selectedId: focusedSession,
        chromeHost: null,
        coordinator: true,
        focused: false,
        visible: false,
        pendingContextHandoff: null,
      })}
      {finderOpen ? (
        <section
          aria-label="Find a session"
          className="shrink-0 border-b border-[var(--border-strong)] bg-[var(--surface-raised)] p-3"
          id="session-workspace-finder"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setFinderOpen(false);
              finderButtonRef.current?.focus();
            }
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              className="block text-[length:var(--text-control)] text-[var(--text-soft)]"
              htmlFor="session-workspace-search"
            >
              Search loaded and local sessions
            </label>
            <Button
              variant="ghost"
              className={CONTROL}
              onClick={() => {
                setFinderOpen(false);
                props.onSurfaceChange?.("history");
              }}
              type="button"
            >
              Full history
            </Button>
          </div>
          <Input
            className="min-h-9 w-full border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            id="session-workspace-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Title or session ID"
            ref={searchRef}
            value={search}
          />
          <ul
            className="mt-2 grid max-h-48 gap-1 overflow-y-auto"
            aria-label="Session search results"
          >
            {ids
              .filter((id) =>
                `${id} ${titleFor(id)}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((id) => (
                <li key={id}>
                  <Button
                    variant="ghost"
                    className={`${CONTROL} w-full justify-between text-left`}
                    onClick={() => focusSession(id, true)}
                    type="button"
                  >
                    <span className="min-w-0 truncate">{titleFor(id)}</span>
                    <span className="shrink-0 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
                      {layout.openIds.includes(id) ? "Focus" : "Open"} ·{" "}
                      {statusFor(id)}
                    </span>
                  </Button>
                </li>
              ))}
            {ids.filter((id) =>
              `${id} ${titleFor(id)}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            ).length === 0 ? (
              <li className="py-3 text-sm text-[var(--muted)]">
                No matching sessions.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
      {announcement || layoutWarning ? (
        <div
          aria-live="polite"
          className="shrink-0 border-b border-[var(--border)] px-3 py-2 text-[length:var(--text-control)] text-[var(--text-soft)]"
          role="status"
        >
          {layoutWarning || announcement}
        </div>
      ) : null}
      {conversationSurface && layout.openIds.length > 1 ? (
        <div className="flex min-h-10 shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface)] max-[760px]:min-h-11">
          <div
            aria-label="Open conversations"
            className="flex min-w-0 flex-1 overflow-x-auto"
            role="tablist"
          >
            {layout.openIds.map((id, index) => (
              <div
                className="flex shrink-0 border-r border-[var(--border)]"
                key={id}
                role="presentation"
              >
                <Button
                  variant="ghost"
                  aria-controls={`session-panel-${id}`}
                  aria-selected={id === layout.focusedId}
                  className="min-h-10 max-w-52 shrink-0 truncate border-r border-[var(--border)] px-3 text-[length:var(--text-control)] text-[var(--text-soft)] aria-selected:border-b-2 aria-selected:border-b-[var(--accent)] aria-selected:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] max-[760px]:min-h-11"
                  id={`session-tab-${id}`}
                  onClick={() => focusSession(id)}
                  onKeyDown={(event) => {
                    const next =
                      event.key === "ArrowRight"
                        ? (index + 1) % layout.openIds.length
                        : event.key === "ArrowLeft"
                          ? (index + layout.openIds.length - 1) %
                            layout.openIds.length
                          : event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? layout.openIds.length - 1
                              : -1;
                    if (next < 0) return;
                    event.preventDefault();
                    const nextId = layout.openIds[next];
                    if (!nextId) return;
                    focusSession(nextId);
                    document.getElementById(`session-tab-${nextId}`)?.focus();
                  }}
                  role="tab"
                  tabIndex={id === layout.focusedId ? 0 : -1}
                  type="button"
                >
                  {titleFor(id)}{" "}
                  <span className="ml-2 text-[length:var(--text-meta)] text-[var(--muted)]">
                    {statusFor(id)}
                  </span>
                </Button>
                <button
                  aria-label={`Close ${titleFor(id)} view`}
                  className="grid min-h-10 w-8 place-items-center text-[var(--muted)] hover:text-[var(--text)] max-[760px]:min-h-11 max-[760px]:w-11"
                  onClick={() => closePanel(id)}
                  title="Close view only; running work continues"
                  type="button"
                >
                  <X aria-hidden size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1 px-1">
            <Button
              aria-controls="session-workspace-finder"
              aria-expanded={finderOpen}
              aria-label="Find session"
              className={CONTROL}
              onClick={() => setFinderOpen((value) => !value)}
              ref={finderButtonRef}
              title="Find session"
              type="button"
              variant="ghost"
            >
              <Search aria-hidden size={14} />
            </Button>
            <Button
              aria-label="New session"
              className={CONTROL}
              onClick={createSession}
              title="New conversation view"
              type="button"
              variant="ghost"
            >
              <Plus aria-hidden size={14} />
            </Button>
            {!isNarrow ? (
              <details
                className="relative"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.currentTarget.open = false;
                  }
                }}
              >
                <summary className={`${CONTROL} list-none cursor-pointer`}>
                  <Columns2 aria-hidden size={14} />
                  <span className="sr-only">Layout views</span>
                </summary>
                <div className="absolute right-0 z-40 mt-1 grid max-h-64 w-56 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-1 shadow-[var(--shell-shadow-md)]">
                  <button
                    className="min-h-10 rounded px-2 text-left text-sm hover:bg-[var(--surface-hover)]"
                    onClick={() =>
                      setLayout((current) => ({ ...current, mode: "tabs" }))
                    }
                    type="button"
                  >
                    Show as tabs
                  </button>
                  {layout.openIds
                    .filter((id) => id !== layout.focusedId)
                    .map((id) => (
                      <div className="grid" key={id}>
                        <span className="truncate px-2 pt-2 text-xs text-[var(--muted)]">
                          {titleFor(id)}
                        </span>
                        <button
                          className="min-h-10 rounded px-2 text-left text-sm hover:bg-[var(--surface-hover)]"
                          onClick={() =>
                            setLayout((current) =>
                              splitWorkspaceSession(
                                current,
                                current.focusedId,
                                id,
                                "horizontal",
                              ),
                            )
                          }
                          type="button"
                        >
                          Split right
                        </button>
                        <button
                          className="min-h-10 rounded px-2 text-left text-sm hover:bg-[var(--surface-hover)]"
                          onClick={() =>
                            setLayout((current) =>
                              splitWorkspaceSession(
                                current,
                                current.focusedId,
                                id,
                                "vertical",
                              ),
                            )
                          }
                          type="button"
                        >
                          Split below
                        </button>
                      </div>
                    ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        data-session-panels
        ref={panelsRef}
      >
        {layout.openIds.length === 0 ? (
          <div className="grid min-h-0 flex-1 content-center justify-items-center gap-3 p-6 text-center">
            <p className="font-[var(--font-mono)] text-[length:var(--text-control)] uppercase tracking-widest text-[var(--accent-text)]">
              No open panels
            </p>
            <h2 className="text-[length:var(--page-title-size)] text-[var(--text)]">
              Your sessions are still here.
            </h2>
            <p className="max-w-md text-sm text-[var(--muted)]">
              Closing a view keeps its draft and history, and never stops an
              agent. Find a session to reopen it or start a new one.
            </p>
            <Button
              variant="ghost"
              className={CONTROL}
              onClick={() => setFinderOpen(true)}
              type="button"
            >
              Find session
            </Button>
          </div>
        ) : null}
        {mountedIds.map((id) => {
          const index = layout.openIds.indexOf(id);
          const focused = id === layout.focusedId;
          const visible =
            index >= 0 && (conversationSurface ? !tabbed || focused : focused);
          const title = titleFor(id);
          const nextId = layout.openIds[index + 1];
          const rect = geometry.panels[id];
          return (
            <div className="contents" key={id}>
              <section
                aria-label={
                  tabbed && conversationSurface
                    ? undefined
                    : `Session: ${title}`
                }
                aria-labelledby={
                  tabbed && conversationSurface
                    ? `session-tab-${id}`
                    : undefined
                }
                className={`absolute flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--bg)] ${!tabbed && focused ? "ring-1 ring-inset ring-[var(--accent-border)]" : ""}`}
                data-session-panel={id}
                hidden={!visible}
                inert={!visible}
                id={`session-panel-${id}`}
                onFocusCapture={() => {
                  if (!focused) focusSession(id);
                }}
                role={
                  tabbed && conversationSurface && layout.openIds.length > 1
                    ? "tabpanel"
                    : "region"
                }
                style={{
                  display: visible ? undefined : "none",
                  left: tabbed || !conversationSurface ? 0 : `${rect?.x ?? 0}%`,
                  top: tabbed || !conversationSurface ? 0 : `${rect?.y ?? 0}%`,
                  width:
                    tabbed || !conversationSurface
                      ? "100%"
                      : `${rect?.width ?? 100}%`,
                  height:
                    tabbed || !conversationSurface
                      ? "100%"
                      : `${rect?.height ?? 100}%`,
                }}
                tabIndex={-1}
              >
                {conversationSurface && layout.openIds.length === 1 ? (
                  <div className="flex min-h-10 shrink-0 items-center justify-end gap-1 border-b border-[var(--border)] px-2">
                    <Button
                      aria-controls="session-workspace-finder"
                      aria-expanded={finderOpen}
                      aria-label="Find session"
                      className={CONTROL}
                      onClick={() => setFinderOpen((value) => !value)}
                      ref={finderButtonRef}
                      type="button"
                      variant="ghost"
                    >
                      <Search aria-hidden size={14} />
                    </Button>
                    <Button
                      aria-label="New session"
                      className={CONTROL}
                      onClick={createSession}
                      type="button"
                      variant="ghost"
                    >
                      <Plus aria-hidden size={14} />
                    </Button>
                    <Button
                      aria-label={`Close ${title}`}
                      className={CONTROL}
                      onClick={() => closePanel(id)}
                      title="Close view only; running work continues"
                      type="button"
                      variant="ghost"
                    >
                      <X aria-hidden size={14} />
                    </Button>
                  </div>
                ) : null}
                {!tabbed && layout.openIds.length > 1 ? (
                  <div className="flex min-h-10 shrink-0 items-center justify-between gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-2">
                    <Button
                      variant="ghost"
                      aria-label={`Focus ${title}`}
                      aria-pressed={focused}
                      className="inline-flex min-h-9 min-w-0 flex-1 items-center justify-start truncate px-1 text-left text-sm font-medium text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                      data-session-focus={id}
                      onClick={() => focusSession(id, true)}
                      title={id}
                      type="button"
                    >
                      <span className="mr-2 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {title}
                    </Button>
                    <span
                      aria-live="polite"
                      className={`shrink-0 font-[var(--font-mono)] text-[length:var(--text-meta)] ${activeRequests[id] ? "text-[var(--accent-text)]" : "text-[var(--muted)]"}`}
                    >
                      {statusFor(id)}
                    </span>
                    <Button
                      variant="ghost"
                      aria-label={`Move ${title} left`}
                      className={CONTROL}
                      disabled={index === 0}
                      onClick={() =>
                        setLayout((current) =>
                          moveWorkspaceSession(current, id, -1),
                        )
                      }
                      type="button"
                    >
                      <ArrowLeft aria-hidden size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={`Move ${title} right`}
                      className={CONTROL}
                      disabled={!nextId}
                      onClick={() =>
                        setLayout((current) =>
                          moveWorkspaceSession(current, id, 1),
                        )
                      }
                      type="button"
                    >
                      <ArrowRight aria-hidden size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={`Close ${title}`}
                      className={CONTROL}
                      onClick={() => closePanel(id)}
                      title="Close view only. Running agents continue."
                      type="button"
                    >
                      <X aria-hidden size={14} />
                    </Button>
                  </div>
                ) : null}
                <div className="min-h-0 flex-1 overflow-hidden">
                  {renderPanel({
                    ...props,
                    ...botScopeFor(id),
                    remoteSessions: panelSessions,
                    selectedId: id,
                    onSelect: focusSession,
                    chromeHost: focused ? props.chromeHost : null,
                    surface: focused ? props.surface : "conversation",
                    coordinator: false,
                    focused,
                    visible,
                  })}
                </div>
              </section>
            </div>
          );
        })}
        {!tabbed && conversationSurface
          ? geometry.dividers.map((divider) => (
              <hr
                aria-label={`Resize ${divider.axis === "horizontal" ? "left and right" : "upper and lower"} conversations`}
                aria-orientation={
                  divider.axis === "horizontal" ? "vertical" : "horizontal"
                }
                aria-valuemin={20}
                aria-valuemax={80}
                aria-valuenow={Math.round(divider.ratio * 100)}
                className={`absolute z-10 touch-none bg-[var(--border)] hover:bg-[var(--accent-border)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${divider.axis === "horizontal" ? "w-2 -translate-x-1 cursor-col-resize" : "h-2 -translate-y-1 cursor-row-resize"}`}
                data-session-resizer
                key={divider.path}
                onKeyDown={(event) => {
                  const forward =
                    divider.axis === "horizontal" ? "ArrowRight" : "ArrowDown";
                  const backward =
                    divider.axis === "horizontal" ? "ArrowLeft" : "ArrowUp";
                  if (![forward, backward, "Home"].includes(event.key)) return;
                  event.preventDefault();
                  setLayout((current) =>
                    resizeWorkspaceSplit(
                      current,
                      divider.path,
                      event.key === "Home"
                        ? 0.5
                        : divider.ratio +
                            (event.key === forward ? 0.05 : -0.05),
                    ),
                  );
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  event.currentTarget.dataset.start = String(
                    divider.axis === "horizontal"
                      ? event.clientX
                      : event.clientY,
                  );
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId))
                    return;
                  const coordinate =
                    divider.axis === "horizontal"
                      ? event.clientX
                      : event.clientY;
                  const previous = Number(event.currentTarget.dataset.start);
                  const size =
                    divider.axis === "horizontal"
                      ? panelSize.width
                      : panelSize.height;
                  const percent =
                    divider.axis === "horizontal"
                      ? divider.width || 100
                      : divider.height || 100;
                  setLayout((current) =>
                    resizeWorkspaceSplit(
                      current,
                      divider.path,
                      divider.ratio +
                        (coordinate - previous) /
                          Math.max(1, (size * percent) / 100),
                    ),
                  );
                  event.currentTarget.dataset.start = String(coordinate);
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                style={{
                  left: `${divider.x}%`,
                  top: `${divider.y}%`,
                  width:
                    divider.axis === "horizontal" ? 8 : `${divider.width}%`,
                  height:
                    divider.axis === "vertical" ? 8 : `${divider.height}%`,
                }}
                tabIndex={0}
                title="Drag or use arrow keys to resize; Home resets"
              />
            ))
          : null}
      </div>
    </section>
  );
}
