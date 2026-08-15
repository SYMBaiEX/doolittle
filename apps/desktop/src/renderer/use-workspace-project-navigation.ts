import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";
import type {
  Project,
  SessionSummary,
  WorkspacePickResult,
  WorkspaceState,
} from "../shared/contracts";
import type { ToastInput } from "./components/ToastRegion";
import {
  PROJECT_SWITCH_DEBOUNCE_MS,
  type View,
  workspaceName,
} from "./desktop-navigation";
import type { ProjectScope } from "./project-manager/models";
import { resolveWorkspaceSelection } from "./workspace-selection";

interface WorkspaceTransitionSnapshot {
  readonly current: number;
  readonly inFlight: number;
  readonly pendingScope: ProjectScope | null;
}

export interface WorkspaceTransitionCoordinator {
  begin(pendingScope: ProjectScope | null): number;
  clearPending(transition: number): void;
  finishRequest(): void;
  isCurrent(transition: number): boolean;
  snapshot(): WorkspaceTransitionSnapshot;
  startRequest(): void;
}

function workspaceMutationIsBlocked(
  coordinator: WorkspaceTransitionCoordinator,
  parentTransition?: number,
): boolean {
  const snapshot = coordinator.snapshot();
  if (snapshot.inFlight > 0) return true;
  if (snapshot.pendingScope === null) return false;
  return (
    parentTransition === undefined || !coordinator.isCurrent(parentTransition)
  );
}

/**
 * Owns the counters shared by workspace picker, direct path, recent workspace,
 * and project-scope transitions. Keeping this state outside React rendering
 * lets every async completion check one monotonically increasing generation.
 */
export function createWorkspaceTransitionCoordinator(): WorkspaceTransitionCoordinator {
  let current = 0;
  let inFlight = 0;
  let pendingScope: ProjectScope | null = null;

  return {
    begin(nextPendingScope) {
      current += 1;
      pendingScope = nextPendingScope;
      return current;
    },
    clearPending(transition) {
      if (current === transition) pendingScope = null;
    },
    finishRequest() {
      inFlight = Math.max(0, inFlight - 1);
    },
    isCurrent(transition) {
      return current === transition;
    },
    snapshot() {
      return { current, inFlight, pendingScope };
    },
    startRequest() {
      inFlight += 1;
    },
  };
}

export interface WorkspaceRequestOutcome<T> {
  readonly current: boolean;
  readonly result: T;
  readonly transition: number;
}

/**
 * Runs one native workspace request and commits its result only while its
 * transition still owns the desktop context. The request counter is balanced
 * for success, stale completion, and errors.
 */
export async function runWorkspaceRequest<T>({
  coordinator,
  operation,
  onCurrent,
  transition: parentTransition,
}: {
  coordinator: WorkspaceTransitionCoordinator;
  operation: () => Promise<T>;
  onCurrent: (result: T) => void;
  transition?: number;
}): Promise<WorkspaceRequestOutcome<T>> {
  const transition = parentTransition ?? coordinator.begin(null);
  coordinator.startRequest();
  try {
    const result = await operation();
    const current = coordinator.isCurrent(transition);
    if (current) onCurrent(result);
    return { current, result, transition };
  } finally {
    coordinator.finishRequest();
  }
}

interface UseWorkspaceProjectNavigationOptions {
  readonly backendReady: boolean;
  /** Disables Code mutations while an approved workspace switch is pending. */
  readonly setCodeEditingLocked: (locked: boolean) => void;
  /** Restores Code's dirty guard if an approved switch leaves the editor mounted. */
  readonly restoreCodeDirtyAfterFailedWorkspaceTransition: () => void;
  readonly createSessionId: () => string;
  readonly pathsEqual: (left: string | undefined, right: string) => boolean;
  readonly projects: readonly Project[];
  readonly projectScope: ProjectScope;
  readonly pushToast: (toast: ToastInput) => string;
  readonly selectedSession: string;
  readonly sessions: readonly SessionSummary[];
  readonly setProjectScope: Dispatch<SetStateAction<ProjectScope>>;
  readonly setSelectedSession: Dispatch<SetStateAction<string>>;
  /** Checks whether a view may be left without committing the route change. */
  readonly confirmViewChange: (view: View) => boolean;
  /** Returns whether the route change was committed (for example, after a dirty-edit prompt). */
  readonly setView: (
    view: View,
    options?: { readonly skipDirtyCheck?: boolean },
  ) => boolean;
  readonly setWorkspace: Dispatch<SetStateAction<WorkspaceState>>;
  readonly workspace: WorkspaceState;
  readonly confirmWorkspaceChange?: () => boolean;
}

interface SwitchRecentWorkspaceOptions {
  readonly announce?: boolean;
  readonly sessionId?: string;
  readonly skipWorkspaceConfirmation?: boolean;
  readonly transition?: number;
}

export interface WorkspaceProjectNavigation {
  readonly chooseWorkspace: () => Promise<WorkspacePickResult>;
  readonly handleWorkspaceState: (state: WorkspaceState) => void;
  readonly openWorkspacePath: (path: string) => Promise<WorkspacePickResult>;
  readonly switchToRecentWorkspace: (
    path: string,
    options?: SwitchRecentWorkspaceOptions,
  ) => Promise<boolean>;
  readonly transitionToProjectScope: (
    scope: ProjectScope,
    sessionId: string,
    nextView?: View,
    onActivated?: () => boolean | undefined,
  ) => Promise<boolean>;
}

export function useWorkspaceProjectNavigation({
  backendReady,
  setCodeEditingLocked,
  restoreCodeDirtyAfterFailedWorkspaceTransition,
  createSessionId,
  pathsEqual,
  projects,
  projectScope,
  pushToast,
  selectedSession,
  sessions,
  setProjectScope,
  setSelectedSession,
  confirmViewChange,
  setView,
  setWorkspace,
  workspace,
  confirmWorkspaceChange,
}: UseWorkspaceProjectNavigationOptions): WorkspaceProjectNavigation {
  const coordinatorRef = useRef<WorkspaceTransitionCoordinator | null>(null);
  coordinatorRef.current ??= createWorkspaceTransitionCoordinator();
  const coordinator = coordinatorRef.current;

  const applyWorkspaceSelection = useCallback(
    (state: WorkspaceState, sessionId = selectedSession) => {
      const selection = resolveWorkspaceSelection({
        workspacePath: state.currentPath,
        projects,
        sessions,
        selectedSessionId: sessionId,
        createSessionId,
        pathsEqual,
      });
      setWorkspace(state);
      setProjectScope(selection.projectScope);
      setSelectedSession(selection.sessionId);
    },
    [
      createSessionId,
      pathsEqual,
      projects,
      selectedSession,
      sessions,
      setProjectScope,
      setSelectedSession,
      setWorkspace,
    ],
  );

  const chooseWorkspace =
    useCallback(async (): Promise<WorkspacePickResult> => {
      if (workspaceMutationIsBlocked(coordinator)) {
        return { canceled: true, state: workspace };
      }
      if (confirmWorkspaceChange && !confirmWorkspaceChange()) {
        return { canceled: true, state: workspace };
      }
      const outcome = await runWorkspaceRequest({
        coordinator,
        operation: () => window.doolittle.pickWorkspace(),
        onCurrent: (result) => {
          if (!result.canceled) applyWorkspaceSelection(result.state);
        },
      });
      return outcome.result;
    }, [
      applyWorkspaceSelection,
      confirmWorkspaceChange,
      coordinator,
      workspace,
    ]);

  const openWorkspacePath = useCallback(
    async (path: string): Promise<WorkspacePickResult> => {
      if (workspaceMutationIsBlocked(coordinator)) {
        return { canceled: true, state: workspace };
      }
      if (confirmWorkspaceChange && !confirmWorkspaceChange()) {
        return { canceled: true, state: workspace };
      }
      const outcome = await runWorkspaceRequest({
        coordinator,
        operation: () => window.doolittle.openWorkspace(path),
        onCurrent: (result) => {
          if (!result.canceled) applyWorkspaceSelection(result.state);
        },
      });
      return outcome.result;
    },
    [applyWorkspaceSelection, confirmWorkspaceChange, coordinator, workspace],
  );

  const switchToRecentWorkspace = useCallback(
    async (path: string, options: SwitchRecentWorkspaceOptions = {}) => {
      const announce = options.announce ?? true;
      if (workspaceMutationIsBlocked(coordinator, options.transition)) {
        return false;
      }
      if (
        !options.skipWorkspaceConfirmation &&
        confirmWorkspaceChange &&
        !confirmWorkspaceChange()
      ) {
        return false;
      }
      try {
        const outcome = await runWorkspaceRequest({
          coordinator,
          operation: () => window.doolittle.switchWorkspace(path),
          transition: options.transition,
          onCurrent: (result) => {
            // Commit workspace and chat identity as one parent-owned transition.
            applyWorkspaceSelection(
              result.state,
              options.sessionId ?? selectedSession,
            );
            if (options.transition === undefined) {
              coordinator.clearPending(coordinator.snapshot().current);
            }
            if (announce) {
              pushToast({
                tone: "success",
                title: `Opened ${workspaceName(result.state.currentPath)}`,
                message:
                  "Chats, Git, files, and tools now use this project. The runtime stayed connected.",
              });
            }
          },
        });
        return outcome.current;
      } catch (error) {
        pushToast({
          tone: "error",
          title: "Workspace could not be switched",
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [
      applyWorkspaceSelection,
      confirmWorkspaceChange,
      coordinator,
      pushToast,
      selectedSession,
    ],
  );

  const activateProjectWorkspace = useCallback(
    async (
      scope: ProjectScope,
      transition: number,
      sessionId: string,
      skipWorkspaceConfirmation = false,
    ): Promise<boolean> => {
      const project =
        scope === "all" || scope === "unscoped"
          ? undefined
          : projects.find((entry) => entry.id === scope);
      if (
        project?.primaryPath &&
        !pathsEqual(project.primaryPath, workspace.currentPath)
      ) {
        if (
          workspace.recentPaths.some((path) =>
            pathsEqual(path, project.primaryPath as string),
          )
        ) {
          return switchToRecentWorkspace(project.primaryPath, {
            announce: false,
            sessionId,
            skipWorkspaceConfirmation,
            transition,
          });
        }
        pushToast({
          tone: "warning",
          title: "Project folder needs approval",
          message:
            "Open this folder once with the native workspace picker before Doolittle can switch to it automatically.",
        });
        return false;
      }
      return true;
    },
    [
      pathsEqual,
      projects,
      pushToast,
      switchToRecentWorkspace,
      workspace.currentPath,
      workspace.recentPaths,
    ],
  );

  const transitionToProjectScope = useCallback(
    (
      scope: ProjectScope,
      sessionId: string,
      nextView?: View,
      onActivated?: () => boolean | undefined,
    ): Promise<boolean> => {
      if (coordinator.snapshot().inFlight > 0) return Promise.resolve(false);
      const transition = coordinator.begin(scope);
      // A newer navigation attempt owns any pending Code lock from an older one.
      setCodeEditingLocked(false);
      const project =
        scope === "all" || scope === "unscoped"
          ? undefined
          : projects.find((entry) => entry.id === scope);
      const needsWorkspaceSwitch =
        Boolean(project?.primaryPath) &&
        !pathsEqual(project?.primaryPath, workspace.currentPath);
      const workspaceSwitchWasPreflighted = needsWorkspaceSwitch;
      if (workspaceSwitchWasPreflighted) {
        const approved = nextView
          ? confirmViewChange(nextView)
          : (confirmWorkspaceChange?.() ?? true);
        if (!approved) {
          coordinator.clearPending(transition);
          restoreCodeDirtyAfterFailedWorkspaceTransition();
          return Promise.resolve(false);
        }
      }
      if (workspaceSwitchWasPreflighted) setCodeEditingLocked(true);
      return new Promise((resolve) => {
        const activate = async () => {
          if (!coordinator.isCurrent(transition)) {
            resolve(false);
            return;
          }
          try {
            const activated = await activateProjectWorkspace(
              scope,
              transition,
              sessionId,
              workspaceSwitchWasPreflighted,
            );
            if (!coordinator.isCurrent(transition)) {
              resolve(false);
              return;
            }
            coordinator.clearPending(transition);
            if (!activated) {
              if (workspaceSwitchWasPreflighted) {
                restoreCodeDirtyAfterFailedWorkspaceTransition();
              }
              setCodeEditingLocked(false);
              resolve(false);
              return;
            }
            const committed = !nextView
              ? true
              : workspaceSwitchWasPreflighted
                ? setView(nextView, { skipDirtyCheck: true })
                : setView(nextView);
            if (!committed) {
              if (workspaceSwitchWasPreflighted) {
                restoreCodeDirtyAfterFailedWorkspaceTransition();
              }
              setCodeEditingLocked(false);
              resolve(false);
              return;
            }
            setProjectScope(scope);
            setSelectedSession(sessionId);
            setCodeEditingLocked(false);
            resolve(onActivated?.() !== false);
          } catch {
            if (coordinator.isCurrent(transition)) {
              coordinator.clearPending(transition);
              if (workspaceSwitchWasPreflighted) {
                restoreCodeDirtyAfterFailedWorkspaceTransition();
              }
              setCodeEditingLocked(false);
            }
            resolve(false);
          }
        };
        if (needsWorkspaceSwitch) {
          window.setTimeout(() => void activate(), PROJECT_SWITCH_DEBOUNCE_MS);
        } else {
          void activate();
        }
      });
    },
    [
      activateProjectWorkspace,
      confirmViewChange,
      confirmWorkspaceChange,
      coordinator,
      pathsEqual,
      projects,
      setProjectScope,
      setSelectedSession,
      setCodeEditingLocked,
      setView,
      restoreCodeDirtyAfterFailedWorkspaceTransition,
      workspace.currentPath,
    ],
  );

  const handleWorkspaceState = useCallback(
    (state: WorkspaceState) => {
      if (coordinator.snapshot().inFlight > 0) {
        return;
      }
      applyWorkspaceSelection(state);
    },
    [applyWorkspaceSelection, coordinator],
  );

  useEffect(() => {
    if (
      !backendReady ||
      coordinator.snapshot().pendingScope !== null ||
      projectScope === "all" ||
      projectScope === "unscoped"
    ) {
      return;
    }
    const project = projects.find(
      (entry) => entry.id === projectScope && !entry.archivedAt,
    );
    const projectPath = project?.primaryPath;
    if (
      !projectPath ||
      pathsEqual(projectPath, workspace.currentPath) ||
      !workspace.recentPaths.some((path) => pathsEqual(path, projectPath))
    ) {
      return;
    }
    void switchToRecentWorkspace(projectPath, { announce: false });
  }, [
    backendReady,
    coordinator,
    pathsEqual,
    projectScope,
    projects,
    switchToRecentWorkspace,
    workspace.currentPath,
    workspace.recentPaths,
  ]);

  return {
    chooseWorkspace,
    handleWorkspaceState,
    openWorkspacePath,
    switchToRecentWorkspace,
    transitionToProjectScope,
  };
}
