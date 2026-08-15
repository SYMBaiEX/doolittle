import { useCallback, useMemo, useRef, useState } from "react";
import type {
  ActivityEvent,
  Project,
  SessionSummary,
} from "../shared/contracts";
import {
  type ChatContextHandoff,
  type ChatContextRequest,
  resolveChatContextProjectScope,
  splitChatContext,
} from "./chat-context-handoff";
import type { CommandGroup } from "./components/CommandPalette";
import type { ToastInput } from "./components/ToastRegion";
import type { View } from "./desktop-navigation";
import {
  acknowledgeNavigationIntent,
  createOrchestrationTaskNavigationIntent,
  createWorkspaceFileNavigationIntent,
  type DesktopNavigationIntent,
} from "./desktop-navigation-intent";
import {
  type GlobalSearchTarget,
  globalSearchGroups,
  useGlobalSearch,
} from "./global-search";
import type { ProjectScope } from "./project-manager/models";
import { projectNavigationTarget } from "./project-navigation";

export interface NavigationTransitionCoordinator {
  begin(): number;
  isCurrent(transition: number): boolean;
}

/** Prevents a slow workspace switch from applying an obsolete search target. */
export function createNavigationTransitionCoordinator(): NavigationTransitionCoordinator {
  let current = 0;
  return {
    begin() {
      current += 1;
      return current;
    },
    isCurrent(transition) {
      return current === transition;
    },
  };
}

interface GlobalSearchNavigationActions {
  readonly openProjectManager: () => void;
  readonly openSession: (sessionId: string, projectId?: string) => void;
  readonly pathsEqual: (left: string | undefined, right: string) => boolean;
  readonly selectProjectScope: (scope: ProjectScope) => void;
  readonly setNavigationIntent: (intent: DesktopNavigationIntent) => void;
  readonly setView: (view: View) => void;
  readonly switchToRecentWorkspace: (
    path: string,
    options?: { announce?: boolean },
  ) => Promise<boolean>;
  readonly workspacePath: string;
}

export async function navigateGlobalSearchTarget(
  target: GlobalSearchTarget,
  coordinator: NavigationTransitionCoordinator,
  actions: GlobalSearchNavigationActions,
): Promise<void> {
  const transition = coordinator.begin();
  switch (target.kind) {
    case "conversation":
      actions.openSession(target.sessionId, target.projectId);
      return;
    case "project":
      actions.selectProjectScope(target.projectId);
      return;
    case "projectSource":
      actions.selectProjectScope(target.projectId);
      actions.openProjectManager();
      return;
    case "workspace":
      actions.setView("code");
      actions.setNavigationIntent(
        createWorkspaceFileNavigationIntent(target.path),
      );
      return;
    case "task": {
      if (
        target.workspacePath &&
        !actions.pathsEqual(target.workspacePath, actions.workspacePath)
      ) {
        const switched = await actions.switchToRecentWorkspace(
          target.workspacePath,
          { announce: false },
        );
        if (!switched || !coordinator.isCurrent(transition)) return;
      }
      if (!coordinator.isCurrent(transition)) return;
      actions.setView("orchestration");
      actions.setNavigationIntent(
        createOrchestrationTaskNavigationIntent(target.taskId),
      );
      return;
    }
    case "log":
      actions.setView("logs");
  }
}

export type ChatContextHandoffResolution =
  | { readonly status: "empty" }
  | { readonly status: "unresolved" }
  | {
      readonly status: "ready";
      readonly handoff: ChatContextHandoff;
      readonly scope: ProjectScope;
      readonly sessionId: string;
    };

export function resolveChatContextHandoff({
  createId,
  createSessionId,
  pathsEqual,
  projects,
  request,
  selectedSession,
  sessions,
}: {
  createId: () => string;
  createSessionId: () => string;
  pathsEqual: (left: string | undefined, right: string) => boolean;
  projects: readonly Project[];
  request: ChatContextRequest;
  selectedSession: string;
  sessions: readonly SessionSummary[];
}): ChatContextHandoffResolution {
  const text = request.text.trim();
  if (!text) return { status: "empty" };
  const { prompt, capsule } = splitChatContext(text);
  const scope = resolveChatContextProjectScope(
    { ...request, text },
    projects,
    pathsEqual,
  );
  if (!scope) return { status: "unresolved" };

  const belongsToScope = (session: SessionSummary) =>
    scope === "unscoped" ? !session.projectId : session.projectId === scope;
  const targetSession =
    sessions.find(
      (session) =>
        session.sessionId === selectedSession && belongsToScope(session),
    ) ??
    sessions
      .filter(belongsToScope)
      .sort((left, right) =>
        (right.endedAt ?? right.startedAt ?? "").localeCompare(
          left.endedAt ?? left.startedAt ?? "",
        ),
      )[0];
  const sessionId = targetSession?.sessionId ?? createSessionId();
  return {
    status: "ready",
    scope,
    sessionId,
    handoff: {
      id: createId(),
      text,
      prompt,
      capsule,
      workspacePath: request.workspacePath,
      projectScope: scope,
      sessionId,
    },
  };
}

interface UseDesktopContentNavigationOptions {
  readonly backendReady: boolean;
  readonly closeUtilities: () => void;
  readonly createId: () => string;
  readonly createSessionId: () => string;
  readonly paletteOpen: boolean;
  readonly paletteQuery: string;
  readonly pathsEqual: (left: string | undefined, right: string) => boolean;
  readonly projects: readonly Project[];
  readonly projectScope: ProjectScope;
  readonly pushToast: (toast: ToastInput) => string;
  readonly selectedSession: string;
  readonly selectProjectScope: (scope: ProjectScope) => void;
  readonly sessions: readonly SessionSummary[];
  readonly setProjectManagerOpen: (open: boolean) => void;
  readonly setView: (view: View) => void;
  readonly switchToRecentWorkspace: (
    path: string,
    options?: { announce?: boolean },
  ) => Promise<boolean>;
  readonly transitionToProjectScope: (
    scope: ProjectScope,
    sessionId: string,
    nextView?: View,
    onActivated?: () => boolean | undefined,
  ) => Promise<boolean>;
  readonly workspacePath: string;
}

export function useDesktopContentNavigation({
  backendReady,
  closeUtilities,
  createId,
  createSessionId,
  paletteOpen,
  paletteQuery,
  pathsEqual,
  projects,
  projectScope,
  pushToast,
  selectedSession,
  selectProjectScope,
  sessions,
  setProjectManagerOpen,
  setView,
  switchToRecentWorkspace,
  transitionToProjectScope,
  workspacePath,
}: UseDesktopContentNavigationOptions) {
  const [pendingChatContext, setPendingChatContext] =
    useState<ChatContextHandoff | null>(null);
  const [pendingNavigationIntent, setPendingNavigationIntent] =
    useState<DesktopNavigationIntent | null>(null);
  const navigationCoordinatorRef =
    useRef<NavigationTransitionCoordinator | null>(null);
  navigationCoordinatorRef.current ??= createNavigationTransitionCoordinator();
  const navigationCoordinator = navigationCoordinatorRef.current;

  const openSession = useCallback(
    (sessionId: string, projectId?: string) => {
      const session = sessions.find((entry) => entry.sessionId === sessionId);
      transitionToProjectScope(
        projectId ??
          (session ? (session.projectId ?? "unscoped") : projectScope),
        sessionId,
        projectNavigationTarget("open-conversation"),
      );
    },
    [projectScope, sessions, transitionToProjectScope],
  );

  const openActivityTarget = useCallback(
    (event: ActivityEvent) => {
      closeUtilities();
      if (event.target === "chat") {
        if (event.sessionId) openSession(event.sessionId);
        else setView("chat");
        return;
      }
      if (event.target === "terminal" || event.target === "workspace") {
        setView("code");
        return;
      }
      if (event.target === "codegen") {
        setView("orchestration");
        return;
      }
      if (event.target === "operations") {
        setView("logs");
        return;
      }
      setView(event.target);
    },
    [closeUtilities, openSession, setView],
  );

  const openChatWithContext = useCallback(
    async (request: ChatContextRequest): Promise<boolean> => {
      const resolution = resolveChatContextHandoff({
        createId,
        createSessionId,
        pathsEqual,
        projects,
        request,
        selectedSession,
        sessions,
      });
      if (resolution.status === "empty") return false;
      if (resolution.status === "unresolved") {
        pushToast({
          tone: "warning",
          title: "Context was not sent",
          message:
            "Select or create a project for this workspace before sending its context to Chat.",
        });
        return false;
      }
      try {
        return await transitionToProjectScope(
          resolution.scope,
          resolution.sessionId,
          "chat",
          () => {
            setPendingChatContext(resolution.handoff);
            return true;
          },
        );
      } catch {
        return false;
      }
    },
    [
      createId,
      createSessionId,
      pathsEqual,
      projects,
      pushToast,
      selectedSession,
      sessions,
      transitionToProjectScope,
    ],
  );

  const consumeChatContext = useCallback((id: string) => {
    setPendingChatContext((current) => (current?.id === id ? null : current));
  }, []);

  const consumeNavigationIntent = useCallback((id: string) => {
    setPendingNavigationIntent((current) =>
      acknowledgeNavigationIntent(current, id),
    );
  }, []);

  const openWorkspaceFile = useCallback(
    (path: string) => {
      const normalizedPath = path.trim();
      if (!normalizedPath) return;
      closeUtilities();
      setPendingNavigationIntent(
        createWorkspaceFileNavigationIntent(normalizedPath),
      );
      setView("code");
    },
    [closeUtilities, setView],
  );

  const globalSearch = useGlobalSearch(
    paletteQuery,
    paletteOpen && backendReady,
    workspacePath,
  );
  const selectGlobalSearchResult = useCallback(
    (target: GlobalSearchTarget) => {
      void navigateGlobalSearchTarget(target, navigationCoordinator, {
        openProjectManager: () => setProjectManagerOpen(true),
        openSession,
        pathsEqual,
        selectProjectScope,
        setNavigationIntent: setPendingNavigationIntent,
        setView,
        switchToRecentWorkspace,
        workspacePath,
      });
    },
    [
      navigationCoordinator,
      openSession,
      pathsEqual,
      selectProjectScope,
      setProjectManagerOpen,
      setView,
      switchToRecentWorkspace,
      workspacePath,
    ],
  );

  const searchCommandGroups = useMemo<CommandGroup[]>(() => {
    const groups = globalSearchGroups(
      globalSearch.results,
      selectGlobalSearchResult,
    );
    if (paletteQuery.trim().length < 2) return groups;
    if (globalSearch.loading || globalSearch.error) {
      groups.unshift({
        id: "search-state",
        label: "Local search",
        items: [
          {
            id: globalSearch.loading ? "searching" : "partial-error",
            label: globalSearch.loading
              ? "Searching local workspace…"
              : "Some search sources are unavailable",
            description:
              globalSearch.error ||
              "Searching projects, sources, conversations, code, tasks, and logs.",
            keywords: [paletteQuery],
            disabled: true,
          },
        ],
      });
    }
    return groups;
  }, [
    globalSearch.error,
    globalSearch.loading,
    globalSearch.results,
    paletteQuery,
    selectGlobalSearchResult,
  ]);

  return {
    consumeChatContext,
    consumeNavigationIntent,
    openActivityTarget,
    openChatWithContext,
    openSession,
    openWorkspaceFile,
    pendingChatContext,
    pendingNavigationIntent,
    searchCommandGroups,
  };
}
