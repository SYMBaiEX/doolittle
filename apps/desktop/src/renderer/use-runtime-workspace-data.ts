import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BackendState,
  BotConversationScope,
  Project,
  ProjectsResponse,
  RuntimeStatus,
  SessionSummary,
} from "../shared/contracts";
import {
  loadBotSessionCatalog,
  loadLeadSessionPage,
  loadOlderLeadHistory,
  mergeOlderLeadHistory,
} from "./bots/session-catalog";
import type { ToastInput } from "./components/ToastRegion";
import { desktopRequest } from "./lib";
import { confirmedConversationSummary } from "./session-conversation-scope";

export function useRuntimeWorkspaceData(
  pushToast: (toast: ToastInput) => string,
) {
  const [backend, setBackend] = useState<BackendState>({
    phase: "booting",
    message: "Connecting to the local runtime…",
  });
  const [backendGeneration, setBackendGeneration] = useState(0);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const [projects, setProjects] = useState<Project[]>([]);
  const [globalError, setGlobalError] = useState("");
  const backendPhaseRef = useRef(backend.phase);
  const backendSubscriptionUpdateRef = useRef(0);
  const refreshRequestRef = useRef<AbortController | null>(null);
  const sessionInventoryRevision = useRef(0);
  const mountedRef = useRef(true);
  const cancelRefresh = useCallback(() => {
    refreshRequestRef.current?.abort();
    refreshRequestRef.current = null;
  }, []);
  const applyBackend = useCallback(
    (state: BackendState) => {
      if (backendPhaseRef.current !== state.phase) {
        backendPhaseRef.current = state.phase;
        cancelRefresh();
        // A ready catalog can only describe workers in this runtime generation.
        if (state.phase === "ready")
          setBackendGeneration((current) => current + 1);
      }
      setBackend(state);
    },
    [cancelRefresh],
  );

  const publishConfirmedConversation = useCallback(
    (scope: BotConversationScope) => {
      if (!mountedRef.current) return;
      const previous = sessionsRef.current.find(
        (row) => row.sessionId === scope.sessionId,
      );
      const confirmed = confirmedConversationSummary(scope, previous);
      if (
        previous &&
        previous.botId === confirmed.botId &&
        previous.projectId === confirmed.projectId &&
        previous.workspacePath === confirmed.workspacePath &&
        JSON.stringify(previous.projectContext) ===
          JSON.stringify(confirmed.projectContext)
      )
        return;
      // An inventory started before this host commit cannot erase or move its row.
      sessionInventoryRevision.current++;
      setSessions((current) => {
        const existing = current.find(
          (row) => row.sessionId === scope.sessionId,
        );
        const next = [
          confirmedConversationSummary(scope, existing),
          ...current.filter((row) => row.sessionId !== scope.sessionId),
        ];
        sessionsRef.current = next;
        return next;
      });
    },
    [],
  );

  const refreshRuntimeData = useCallback(
    async (reuseFreshCatalog: boolean) => {
      if (backendPhaseRef.current !== "ready") return false;
      cancelRefresh();
      const request = new AbortController();
      refreshRequestRef.current = request;
      const { signal } = request;
      const sessionRevision = sessionInventoryRevision.current;
      const isCurrent = () =>
        mountedRef.current && request === refreshRequestRef.current;
      setGlobalError("");
      const [status, inventory, projectList] = await Promise.allSettled([
        desktopRequest<RuntimeStatus>(
          "/runtime/status",
          "GET",
          undefined,
          signal,
        ).then((value) => {
          if (isCurrent()) setRuntime(value);
        }),
        loadBotSessionCatalog(
          loadLeadSessionPage(signal),
          sessionsRef.current,
          { generation: backendGeneration, reuseFreshCatalog, signal },
        ).then((result) => {
          if (
            !isCurrent() ||
            sessionRevision !== sessionInventoryRevision.current
          )
            return;
          setSessions(result.sessions);
          const olderHistory =
            result.leadHistoryPage &&
            loadOlderLeadHistory(result.leadHistoryPage, signal, (rows) => {
              if (isCurrent())
                setSessions((current) =>
                  signal.aborted
                    ? current
                    : mergeOlderLeadHistory(current, rows),
                );
            }).catch(() => "Older conversation history could not be loaded.");
          return { warnings: result.warnings, olderHistory };
        }),
        desktopRequest<ProjectsResponse>(
          "/projects?includeArchived=true",
          "GET",
          undefined,
          signal,
        ).then((value) => {
          if (isCurrent()) setProjects(value.projects);
        }),
      ]);
      if (!isCurrent()) return false;
      const sessionResultIsCurrent =
        sessionRevision === sessionInventoryRevision.current;
      const failure = [
        projectList,
        sessionResultIsCurrent ? inventory : null,
        status,
      ].find((result) => result?.status === "rejected");
      const warning =
        sessionResultIsCurrent && inventory.status === "fulfilled"
          ? inventory.value?.warnings?.at(-1)
          : undefined;
      const error =
        warning ??
        (failure?.status === "rejected"
          ? failure.reason instanceof Error
            ? failure.reason.message
            : String(failure.reason)
          : "");
      setGlobalError(error);
      const older =
        inventory.status === "fulfilled"
          ? inventory.value?.olderHistory
          : undefined;
      if (older) {
        void older.then((warning) => {
          if (!isCurrent()) return;
          refreshRequestRef.current = null;
          if (warning) setGlobalError((current) => current || warning);
        });
      } else {
        refreshRequestRef.current = null;
      }
      return !failure && !warning;
    },
    [backendGeneration, cancelRefresh],
  );

  const refreshRuntime = useCallback(
    () => refreshRuntimeData(false),
    [refreshRuntimeData],
  );

  const refreshWithFeedback = useCallback(async () => {
    const succeeded = await refreshRuntime();
    pushToast({
      tone: succeeded ? "success" : "error",
      title: succeeded ? "Workspace refreshed" : "Refresh incomplete",
      message: succeeded
        ? "Runtime and conversation state are up to date."
        : "Some local runtime data could not be loaded.",
    });
  }, [pushToast, refreshRuntime]);

  const restartRuntime = useCallback(async () => {
    try {
      const subscriptionRevision = backendSubscriptionUpdateRef.current;
      const next = await window.doolittle.retryBackend();
      if (!mountedRef.current) return;
      if (subscriptionRevision === backendSubscriptionUpdateRef.current)
        applyBackend(next);
      pushToast({
        tone: next.phase === "ready" ? "success" : "warning",
        title:
          next.phase === "ready"
            ? "Runtime restarted"
            : "Runtime still offline",
        message: next.message,
      });
    } catch (error) {
      pushToast({
        tone: "error",
        title: "Runtime restart failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [applyBackend, pushToast]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelRefresh();
    };
  }, [cancelRefresh]);

  useEffect(() => {
    let disposed = false;
    const subscriptionUpdateAtStart = backendSubscriptionUpdateRef.current;
    const applyInitial = (state: BackendState) => {
      if (
        !disposed &&
        backendSubscriptionUpdateRef.current === subscriptionUpdateAtStart
      ) {
        applyBackend(state);
      }
    };
    const detach = window.doolittle.onBackendState((state) => {
      backendSubscriptionUpdateRef.current += 1;
      applyBackend(state);
    });
    void window.doolittle.getBackendState().then(applyInitial, () => {
      applyInitial({
        phase: "degraded",
        message: "The desktop could not connect to the local runtime.",
      });
    });
    return () => {
      disposed = true;
      detach();
    };
  }, [applyBackend]);

  useEffect(() => {
    if (backend.phase === "ready") {
      void refreshRuntimeData(true);
    } else {
      setRuntime(null);
    }
  }, [backend.phase, refreshRuntimeData]);

  return {
    backend,
    backendGeneration,
    globalError,
    projects,
    publishConfirmedConversation,
    refreshRuntime,
    refreshWithFeedback,
    restartRuntime,
    runtime,
    sessions,
    setProjects,
    setSessions,
  };
}
