import { type ContextAction, ContextActionMenu } from "@doolittle/ui";
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
import { copyContextText } from "../context-menu-clipboard";
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
  arrangeWorkspaceSessions,
  balanceWorkspaceSizes,
  closeOtherWorkspaceSessions,
  closeWorkspaceSession,
  LEGACY_SESSION_WORKSPACE_STORAGE_KEY,
  MAX_OPEN_PANELS,
  MAX_RETAINED_CLOSED_PANELS,
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
  "inline-flex min-h-10 min-w-10 max-[720px]:min-h-11 max-[720px]:min-w-11 items-center justify-center gap-2 rounded-[var(--radius-md)] border-0 bg-transparent px-2 text-[length:var(--text-control)] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-default disabled:opacity-40";

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
  const [focusView, setFocusView] = useState(false);
  const [closedIds, setClosedIds] = useState<string[]>([]);
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
  const isShort = useMediaQuery("(max-height: 640px)");
  const rootRef = useRef<HTMLElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const panelsButtonRef = useRef<HTMLButtonElement>(null);
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  const requiredSize = workspaceRequiredSize(layout.tree);
  const tabbed =
    focusView ||
    isNarrow ||
    isShort ||
    layout.mode === "tabs" ||
    (panelSize.width > 0 && panelSize.width < requiredSize.width) ||
    (panelSize.height > 0 && panelSize.height < requiredSize.height);
  const geometry = workspaceGeometry(layout.tree);
  const searchRef = useRef<HTMLInputElement>(null);
  const finderButtonRef = useRef<HTMLButtonElement>(null);
  const finderReturnRef = useRef<HTMLElement | null>(null);
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
    knownSessions.current.get(id)?.title?.trim() ||
    messages[id]
      ?.find((message) => message.role === "user")
      ?.content.slice(0, 48) ||
    "New session";
  const matchingIds = ids.filter((id) =>
    `${id} ${titleFor(id)}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
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
    const openFinder = () => {
      finderReturnRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setFinderOpen(true);
    };
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
    if (next === layout) return;
    if (next.openIds.length < 2) setFocusView(false);
    setClosedIds((current) =>
      [...current.filter((closedId) => closedId !== id), id].slice(
        -MAX_RETAINED_CLOSED_PANELS,
      ),
    );
    setLayout(next);
    if (next.focusedId) props.onSelect(next.focusedId);
    setAnnouncement(
      "View closed. Its draft, history, and any active run are retained. Reopen it from Panels or Find session.",
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
        finderButtonRef.current ??
        panelsButtonRef.current
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
    const selectedBot = props.bots?.find(
      (bot) => bot.id === props.selectedBotId,
    );
    props.onCaptureSessionProject?.(
      id,
      selectedBot && !selectedBot.isDefault
        ? (selectedBot.projectId ?? null)
        : (props.activeProject?.id ?? null),
    );
    focusSession(id, true);
  };

  useEffect(() => {
    const createView = () => {
      if (rootRef.current?.closest("[hidden], [inert]")) return;
      createSession();
    };
    window.addEventListener("doolittle:new-conversation-view", createView);
    return () =>
      window.removeEventListener("doolittle:new-conversation-view", createView);
  });

  const focusedSession = layout.focusedId || props.selectedId;
  const conversationSurface =
    (props.surface ?? "conversation") === "conversation";
  const lastClosedId = [...closedIds]
    .reverse()
    .find((id) => !layout.openIds.includes(id));
  const closeOtherPanels = (id: string) => {
    const closing = layout.openIds.filter((openId) => openId !== id);
    if (!closing.length) return;
    setClosedIds((current) =>
      [
        ...current.filter((closedId) => !closing.includes(closedId)),
        ...closing,
      ].slice(-MAX_RETAINED_CLOSED_PANELS),
    );
    setLayout((current) => closeOtherWorkspaceSessions(current, id));
    setFocusView(false);
    focusSession(id, true);
    setAnnouncement(
      "Other views closed. Drafts, history, and active runs are retained.",
    );
  };
  const arrangementActions: ContextAction[] = [
    {
      id: "tabs",
      label: "Tabs",
      disabled: layout.mode === "tabs" && !focusView,
      onSelect: () => {
        setFocusView(false);
        setLayout((current) => ({ ...current, mode: "tabs" }));
      },
    },
    {
      id: "side-by-side",
      label: "Side by side",
      disabled: layout.openIds.length < 2,
      onSelect: () => {
        setFocusView(false);
        setLayout((current) => arrangeWorkspaceSessions(current, "horizontal"));
      },
    },
    {
      id: "stacked",
      label: "Stacked",
      disabled: layout.openIds.length < 2,
      onSelect: () => {
        setFocusView(false);
        setLayout((current) => arrangeWorkspaceSessions(current, "vertical"));
      },
    },
    {
      id: "balance",
      label: "Balance sizes",
      disabled: layout.openIds.length < 2,
      onSelect: () => setLayout((current) => balanceWorkspaceSizes(current)),
    },
    {
      id: "focus-view",
      label: focusView ? "Restore arrangement" : "Focus view",
      disabled:
        !focusView && (layout.mode !== "split" || layout.openIds.length < 2),
      separatorBefore: true,
      onSelect: () => {
        setFocusView((current) => !current);
        focusSession(layout.focusedId, true);
      },
    },
    {
      id: "close-others",
      label: "Close other views (work continues)",
      disabled: layout.openIds.length < 2,
      onSelect: () => closeOtherPanels(layout.focusedId),
    },
    {
      id: "reopen-last",
      label: "Reopen last closed view",
      disabled: !lastClosedId || layout.openIds.length >= MAX_OPEN_PANELS,
      onSelect: () => {
        if (lastClosedId) focusSession(lastClosedId, true);
      },
    },
    {
      id: "find-session",
      label: "Find session",
      separatorBefore: true,
      onSelect: () => {
        finderReturnRef.current = panelsButtonRef.current;
        setFinderOpen(true);
      },
    },
    {
      id: "new-session",
      label: "New session",
      disabled: layout.openIds.length >= MAX_OPEN_PANELS,
      onSelect: createSession,
    },
    {
      id: "close-view",
      label: "Close view (work continues)",
      disabled: !layout.focusedId,
      onSelect: () => closePanel(layout.focusedId),
    },
  ];
  const movePanel = (id: string, direction: -1 | 1) => {
    const index = layout.openIds.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= layout.openIds.length) return;
    setLayout((current) => moveWorkspaceSession(current, id, direction));
    focusSession(id, true);
  };
  const panelActions = (id: string): ContextAction[] => {
    const index = layout.openIds.indexOf(id);
    const companionId =
      layout.focusedId && layout.focusedId !== id
        ? layout.focusedId
        : (layout.openIds[index + 1] ?? layout.openIds[index - 1]);
    const split = (axis: "horizontal" | "vertical") => {
      if (!companionId || isNarrow || isShort) return;
      const sourceId = layout.focusedId === id ? id : companionId;
      const targetId = layout.focusedId === id ? companionId : id;
      const next = splitWorkspaceSession(layout, sourceId, targetId, axis);
      setFocusView(false);
      setLayout(next);
      focusRequestedRef.current = true;
      if (next.focusedId) props.onSelect(next.focusedId);
    };
    return [
      {
        id: "focus",
        label: "Focus conversation",
        onSelect: () => focusSession(id, true),
      },
      {
        id: "move-left",
        label: "Move view left",
        disabled: index <= 0,
        onSelect: () => movePanel(id, -1),
      },
      {
        id: "move-right",
        label: "Move view right",
        disabled: index < 0 || index >= layout.openIds.length - 1,
        onSelect: () => movePanel(id, 1),
      },
      ...(companionId
        ? [
            {
              id: "split-right",
              label: `Split right with ${titleFor(companionId)}`,
              disabled: isNarrow || isShort,
              separatorBefore: true,
              onSelect: () => split("horizontal"),
            },
            {
              id: "split-below",
              label: `Split below with ${titleFor(companionId)}`,
              disabled: isNarrow || isShort,
              onSelect: () => split("vertical"),
            },
          ]
        : []),
      {
        id: "show-tabs",
        label: "Show as tabs",
        disabled: layout.mode === "tabs",
        onSelect: () => {
          setFocusView(false);
          setLayout((current) => ({ ...current, mode: "tabs" }));
        },
      },
      {
        id: "copy-title",
        label: "Copy conversation title",
        separatorBefore: true,
        onSelect: () => void copyContextText(titleFor(id)),
      },
      {
        id: "copy-id",
        label: "Copy conversation ID",
        onSelect: () => void copyContextText(id),
      },
      {
        id: "close-other-views",
        label: "Close other views (work continues)",
        disabled: layout.openIds.length < 2,
        separatorBefore: true,
        onSelect: () => closeOtherPanels(id),
      },
      {
        id: "close-view",
        label: "Close view (work continues)",
        separatorBefore: true,
        onSelect: () => closePanel(id),
      },
    ];
  };

  return (
    <section
      aria-label="Session workbench"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--bg)]"
      ref={rootRef}
      data-session-workbench
      data-session-layout={tabbed ? "tabs" : "split"}
      data-session-focus-view={focusView || undefined}
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
              (finderButtonRef.current ?? finderReturnRef.current)?.focus();
            }
          }}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label
              className="block text-[length:var(--text-control)] text-[var(--text-soft)]"
              htmlFor="session-workspace-search"
            >
              Find a conversation
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
            <Button
              aria-label="Close conversation finder"
              className={CONTROL}
              onClick={() => {
                setFinderOpen(false);
                (finderButtonRef.current ?? finderReturnRef.current)?.focus();
              }}
              type="button"
              variant="ghost"
            >
              <X aria-hidden size={14} />
            </Button>
          </div>
          <Input
            className="min-h-10 w-full border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] max-[760px]:min-h-11"
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
            {matchingIds.map((id) => (
              <li key={id}>
                <ContextActionMenu
                  items={[
                    {
                      id: "open",
                      label: layout.openIds.includes(id)
                        ? "Focus conversation"
                        : "Open conversation",
                      disabled:
                        !layout.openIds.includes(id) &&
                        layout.openIds.length >= MAX_OPEN_PANELS,
                      onSelect: () => focusSession(id, true),
                    },
                    {
                      id: "copy-title",
                      label: "Copy conversation title",
                      separatorBefore: true,
                      onSelect: () => void copyContextText(titleFor(id)),
                    },
                    {
                      id: "copy-id",
                      label: "Copy conversation ID",
                      onSelect: () => void copyContextText(id),
                    },
                    ...(layout.openIds.includes(id)
                      ? [
                          {
                            id: "close-view",
                            label: "Close view (work continues)",
                            separatorBefore: true,
                            onSelect: () => closePanel(id),
                          },
                        ]
                      : []),
                  ]}
                  label={`${titleFor(id)} conversation actions`}
                  scopeKey={`finder:${id}`}
                >
                  <Button
                    variant="ghost"
                    className={`${CONTROL} w-full min-w-0 justify-between text-left`}
                    disabled={
                      !layout.openIds.includes(id) &&
                      layout.openIds.length >= MAX_OPEN_PANELS
                    }
                    onClick={() => focusSession(id, true)}
                    type="button"
                  >
                    <span className="min-w-0 truncate" title={titleFor(id)}>
                      {titleFor(id)}
                    </span>
                    <span className="shrink-0 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
                      {layout.openIds.includes(id) ? "Focus" : "Open"} ·{" "}
                      {statusFor(id)}
                    </span>
                  </Button>
                </ContextActionMenu>
              </li>
            ))}
            {matchingIds.length === 0 ? (
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
      {conversationSurface ? (
        <div className="flex min-h-10 shrink-0 items-center border-b border-[var(--border)] bg-[var(--surface)] max-[760px]:min-h-11">
          {layout.openIds.length > 1 ? (
            <div
              aria-label="Open conversations"
              className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 [scrollbar-width:thin]"
              role="tablist"
            >
              {layout.openIds.map((id, index) => (
                <div
                  className="flex min-w-0 shrink-0 items-center"
                  key={id}
                  role="presentation"
                >
                  <ContextActionMenu
                    className="group flex min-w-0 items-center"
                    items={panelActions(id)}
                    label={`${titleFor(id)} view actions`}
                    scopeKey={`conversation-view:${id}:${layout.focusedId}`}
                  >
                    <Button
                      variant="ghost"
                      aria-controls={`session-panel-${id}`}
                      aria-selected={id === layout.focusedId}
                      className="inline-flex min-h-10 min-w-0 max-w-64 items-center gap-2 rounded-[var(--radius-md)] border-0 bg-transparent px-2 text-[length:var(--text-control)] text-[var(--text-soft)] hover:bg-[var(--surface-hover)] aria-selected:font-semibold aria-selected:text-[var(--text)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] max-[760px]:min-h-11 max-[760px]:max-w-44"
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
                        document
                          .getElementById(`session-tab-${nextId}`)
                          ?.focus();
                      }}
                      role="tab"
                      tabIndex={id === layout.focusedId ? 0 : -1}
                      title={titleFor(id)}
                      type="button"
                    >
                      <span className="min-w-0 truncate">{titleFor(id)}</span>
                      <span
                        className={`shrink-0 text-[length:var(--text-meta)] font-normal text-[var(--muted)] ${statusFor(id) === "Ready" ? "sr-only" : ""}`}
                      >
                        {statusFor(id)}
                      </span>
                    </Button>
                    <button
                      aria-label={`Close ${titleFor(id)} view`}
                      className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] max-[760px]:size-11"
                      onClick={() => closePanel(id)}
                      title="Close view only; running work continues"
                      type="button"
                    >
                      <X aria-hidden size={14} />
                    </button>
                  </ContextActionMenu>
                </div>
              ))}
            </div>
          ) : (
            <span className="min-w-0 flex-1 px-3 text-[length:var(--text-meta)] text-[var(--muted)]">
              {layout.openIds.length ? "1 view" : "No open views"}
            </span>
          )}
          <div className="flex shrink-0 items-center gap-1 px-1">
            {layout.openIds.length > 1 ? (
              <>
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
                  disabled={layout.openIds.length >= MAX_OPEN_PANELS}
                  onClick={createSession}
                  title={
                    layout.openIds.length >= MAX_OPEN_PANELS
                      ? "Close a view before opening another. Running work continues."
                      : "New conversation view"
                  }
                  type="button"
                  variant="ghost"
                >
                  <Plus aria-hidden size={14} />
                </Button>
              </>
            ) : null}
            <ContextActionMenu
              items={arrangementActions}
              label="Manage conversation panels"
              scopeKey={`panels:${layout.focusedId}:${layout.mode}:${focusView}`}
              trigger={
                <Button
                  aria-label="Panels"
                  className={CONTROL}
                  ref={panelsButtonRef}
                  title={
                    layout.mode === "split" && tabbed && !focusView
                      ? "Panels · arrangement saved; tabs shown to fit this window"
                      : "Manage conversation panels"
                  }
                  type="button"
                  variant="ghost"
                >
                  <Columns2 aria-hidden size={14} />
                  Panels
                </Button>
              }
            >
              {null}
            </ContextActionMenu>
          </div>
        </div>
      ) : null}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        data-session-panels
        ref={panelsRef}
      >
        {layout.openIds.length === 0 ? (
          <div className="grid h-full min-h-0 content-center justify-items-center gap-3 overflow-y-auto p-6 text-center">
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
              ref={finderButtonRef}
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
                  tabbed && conversationSurface && layout.openIds.length > 1
                    ? undefined
                    : `Session: ${title}`
                }
                aria-labelledby={
                  tabbed && conversationSurface && layout.openIds.length > 1
                    ? `session-tab-${id}`
                    : undefined
                }
                className="absolute @container/session-pane flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--bg)]"
                data-session-panel={id}
                hidden={!visible}
                inert={!visible}
                id={`session-panel-${id}`}
                onFocusCapture={(event) => {
                  // React portal focus bubbles through this component tree, but
                  // menu contents are not part of the owned pane's DOM.
                  if (!event.currentTarget.contains(event.target)) return;
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
                {!tabbed && layout.openIds.length > 1 ? (
                  <ContextActionMenu
                    items={panelActions(id)}
                    label={`${title} panel actions`}
                    scopeKey={`conversation-panel:${id}:${layout.focusedId}`}
                  >
                    <div className="flex min-h-10 shrink-0 items-center justify-between gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-2">
                      <Button
                        variant="ghost"
                        aria-label={`Focus ${title}`}
                        aria-pressed={focused}
                        className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-start gap-2 overflow-hidden rounded-[var(--radius-md)] px-1 text-left text-sm font-normal text-[var(--text-soft)] aria-pressed:font-semibold aria-pressed:text-[var(--text)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                        data-session-focus={id}
                        onClick={() => focusSession(id, true)}
                        title={title}
                        type="button"
                      >
                        <span className="min-w-0 truncate">{title}</span>
                      </Button>
                      <span
                        aria-live="polite"
                        className={`shrink-0 text-[length:var(--text-meta)] ${activeRequests[id] ? "text-[var(--accent-text)]" : "text-[var(--muted)]"} ${statusFor(id) === "Ready" ? "sr-only" : ""}`}
                      >
                        {statusFor(id)}
                      </span>
                      <Button
                        variant="ghost"
                        aria-label={`Move ${title} left`}
                        className={CONTROL}
                        disabled={index === 0}
                        onClick={() => movePanel(id, -1)}
                        type="button"
                      >
                        <ArrowLeft aria-hidden size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Move ${title} right`}
                        className={CONTROL}
                        disabled={!nextId}
                        onClick={() => movePanel(id, 1)}
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
                  </ContextActionMenu>
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
              <ContextActionMenu
                items={[
                  {
                    id: "reset-size",
                    label: "Reset conversation sizes",
                    onSelect: () =>
                      setLayout((current) =>
                        resizeWorkspaceSplit(current, divider.path, 0.5),
                      ),
                  },
                ]}
                key={divider.path}
                label="Conversation divider actions"
                scopeKey={`divider:${divider.path}`}
              >
                <hr
                  aria-label={`Resize ${divider.axis === "horizontal" ? "left and right" : "upper and lower"} conversations`}
                  aria-orientation={
                    divider.axis === "horizontal" ? "vertical" : "horizontal"
                  }
                  aria-valuemin={20}
                  aria-valuemax={80}
                  aria-valuenow={Math.round(divider.ratio * 100)}
                  className={`absolute z-10 m-0 touch-none border-0 bg-transparent hover:bg-[var(--surface-hover)] before:pointer-events-none before:absolute before:bg-[var(--border)] before:content-[''] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${divider.axis === "horizontal" ? "w-2 -translate-x-1 cursor-col-resize before:inset-y-0 before:left-1/2 before:w-px" : "h-2 -translate-y-1 cursor-row-resize before:inset-x-0 before:top-1/2 before:h-px"}`}
                  data-session-resizer
                  onKeyDown={(event) => {
                    const forward =
                      divider.axis === "horizontal"
                        ? "ArrowRight"
                        : "ArrowDown";
                    const backward =
                      divider.axis === "horizontal" ? "ArrowLeft" : "ArrowUp";
                    if (![forward, backward, "Home"].includes(event.key))
                      return;
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
                    event.currentTarget.focus({ preventScroll: true });
                    event.currentTarget.setPointerCapture(event.pointerId);
                    event.currentTarget.dataset.start = String(
                      divider.axis === "horizontal"
                        ? event.clientX
                        : event.clientY,
                    );
                    event.currentTarget.dataset.ratio = String(divider.ratio);
                    const bounds = panelsRef.current?.getBoundingClientRect();
                    const size =
                      divider.axis === "horizontal"
                        ? bounds?.width || panelSize.width
                        : bounds?.height || panelSize.height;
                    const percent =
                      divider.axis === "horizontal"
                        ? divider.parentWidth
                        : divider.parentHeight;
                    event.currentTarget.dataset.extent = String(
                      Math.max(1, (size * percent) / 100),
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
                    const ratio = Number(event.currentTarget.dataset.ratio);
                    const extent = Number(event.currentTarget.dataset.extent);
                    setLayout((current) =>
                      resizeWorkspaceSplit(
                        current,
                        divider.path,
                        ratio + (coordinate - previous) / extent,
                      ),
                    );
                  }}
                  onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                  }}
                  onPointerCancel={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
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
              </ContextActionMenu>
            ))
          : null}
      </div>
    </section>
  );
}
