import { useCallback, useEffect, useState } from "react";
import type {
  BackendState,
  Project,
  ProjectsResponse,
  RuntimeStatus,
  SessionSummary,
  SessionsResponse,
} from "../shared/contracts";
import type { ToastInput } from "./components/ToastRegion";
import { desktopRequest } from "./lib";

type RuntimeWorkspaceResults = readonly [
  PromiseSettledResult<RuntimeStatus>,
  PromiseSettledResult<SessionsResponse>,
  PromiseSettledResult<ProjectsResponse>,
];

export interface RuntimeWorkspaceSnapshot {
  runtime?: RuntimeStatus;
  sessions?: SessionSummary[];
  projects?: Project[];
  error: string;
  succeeded: boolean;
}

function resultError(result: PromiseRejectedResult): string {
  return result.reason instanceof Error
    ? result.reason.message
    : String(result.reason);
}

export function resolveRuntimeWorkspaceResults(
  results: RuntimeWorkspaceResults,
): RuntimeWorkspaceSnapshot {
  const [runtimeResult, sessionsResult, projectsResult] = results;
  const errors = results
    .filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    )
    .map(resultError);

  return {
    ...(runtimeResult.status === "fulfilled"
      ? { runtime: runtimeResult.value }
      : {}),
    ...(sessionsResult.status === "fulfilled"
      ? { sessions: sessionsResult.value.sessions }
      : {}),
    ...(projectsResult.status === "fulfilled"
      ? { projects: projectsResult.value.projects }
      : {}),
    error: errors.at(-1) ?? "",
    succeeded: errors.length === 0,
  };
}

export function useRuntimeWorkspaceData(
  pushToast: (toast: ToastInput) => string,
) {
  const [backend, setBackend] = useState<BackendState>({
    phase: "booting",
    message: "Connecting to the local runtime…",
  });
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [globalError, setGlobalError] = useState("");

  const refreshRuntime = useCallback(async () => {
    if (backend.phase !== "ready") return false;
    setGlobalError("");
    const snapshot = resolveRuntimeWorkspaceResults(
      await Promise.allSettled([
        desktopRequest<RuntimeStatus>("/runtime/status"),
        desktopRequest<SessionsResponse>("/sessions?limit=200"),
        desktopRequest<ProjectsResponse>("/projects?includeArchived=true"),
      ]),
    );
    if (snapshot.runtime) setRuntime(snapshot.runtime);
    if (snapshot.sessions) setSessions(snapshot.sessions);
    if (snapshot.projects) setProjects(snapshot.projects);
    setGlobalError(snapshot.error);
    return snapshot.succeeded;
  }, [backend.phase]);

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
      const next = await window.doolittle.retryBackend();
      setBackend(next);
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
  }, [pushToast]);

  useEffect(() => {
    void window.doolittle.getBackendState().then(setBackend);
    return window.doolittle.onBackendState(setBackend);
  }, []);

  useEffect(() => {
    if (backend.phase === "ready") {
      void refreshRuntime();
    } else {
      setRuntime(null);
    }
  }, [backend.phase, refreshRuntime]);

  return {
    backend,
    globalError,
    projects,
    refreshRuntime,
    refreshWithFeedback,
    restartRuntime,
    runtime,
    sessions,
    setProjects,
    setSessions,
  };
}
