import { type Dispatch, type SetStateAction, useCallback } from "react";
import type {
  Project,
  ProjectResponse,
  ProjectsResponse,
  SessionSummary,
  WorkspaceState,
} from "../shared/contracts";
import type { ToastInput } from "./components/ToastRegion";
import { type View, workspaceName } from "./desktop-navigation";
import { desktopRequest } from "./lib";
import type {
  ProjectDraft,
  ProjectLike,
  ProjectResourceLike,
  ProjectScope,
} from "./project-manager/models";

type PathsEqual = (left: string | undefined, right: string) => boolean;

export function projectUsesPath(
  project: Project,
  path: string,
  pathsEqual: PathsEqual,
): boolean {
  return (
    pathsEqual(project.primaryPath, path) ||
    project.resources.some(
      (resource) =>
        resource.kind === "folder" && pathsEqual(resource.value, path),
    )
  );
}

export function upsertProject(
  projects: readonly Project[],
  project: Project,
): Project[] {
  return [...projects.filter((entry) => entry.id !== project.id), project];
}

export function replaceProject(
  projects: readonly Project[],
  project: Project,
): Project[] {
  return projects.map((entry) => (entry.id === project.id ? project : entry));
}

export function assignSessionProject(
  sessions: readonly SessionSummary[],
  sessionId: string,
  projectId: string | null,
): SessionSummary[] {
  return sessions.map((session) =>
    session.sessionId === sessionId
      ? { ...session, projectId: projectId ?? undefined }
      : session,
  );
}

interface UseProjectManagementOptions {
  readonly createSessionId: () => string;
  readonly pathsEqual: PathsEqual;
  readonly projectScope: ProjectScope;
  readonly projects: readonly Project[];
  readonly pushToast: (toast: ToastInput) => string;
  readonly selectProjectScope: (scope: ProjectScope) => void;
  readonly selectedSession: string;
  readonly startChatInProject?: (projectId: string | null) => Promise<void>;
  readonly setProjectScope: Dispatch<SetStateAction<ProjectScope>>;
  readonly setProjects: Dispatch<SetStateAction<Project[]>>;
  readonly setSelectedSession: Dispatch<SetStateAction<string>>;
  readonly setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  readonly setView: (view: View) => void;
  readonly setWorkspace: Dispatch<SetStateAction<WorkspaceState>>;
  readonly switchToRecentWorkspace: (path: string) => Promise<boolean>;
  readonly transitionToProjectScope: (
    scope: ProjectScope,
    sessionId: string,
    nextView?: View,
  ) => void;
  readonly workspace: WorkspaceState;
}

export interface ProjectManagementActions {
  readonly addProjectResources: (
    project: ProjectLike,
    kind: "file" | "folder",
  ) => Promise<void>;
  readonly archiveProject: (
    project: ProjectLike,
    archived: boolean,
  ) => Promise<void>;
  readonly chooseRepositoryForConversation: (
    targetSessionId?: string,
  ) => Promise<void>;
  readonly createProject: (draft: ProjectDraft) => Promise<void>;
  readonly moveCurrentChat: (projectId: string | null) => Promise<void>;
  readonly pinProject: (project: ProjectLike, pinned: boolean) => Promise<void>;
  readonly removeProjectResource: (
    project: ProjectLike,
    resource: ProjectResourceLike,
  ) => Promise<void>;
  readonly setProjectPrimaryPath: (
    project: ProjectLike,
    primaryPath: string,
  ) => Promise<void>;
  readonly updateProject: (
    project: ProjectLike,
    draft: ProjectDraft,
  ) => Promise<void>;
}

export function useProjectManagement({
  pathsEqual,
  projectScope,
  projects,
  pushToast,
  selectProjectScope,
  startChatInProject,
  setProjects,
  switchToRecentWorkspace,
  workspace,
}: UseProjectManagementOptions): ProjectManagementActions {
  const reloadProjects = useCallback(async () => {
    const response = await desktopRequest<ProjectsResponse>(
      "/projects?includeArchived=true",
    );
    setProjects(response.projects);
    return response.projects;
  }, [setProjects]);

  const createProject = useCallback(
    async (draft: ProjectDraft) => {
      const response = await desktopRequest<ProjectResponse>(
        "/projects",
        "POST",
        {
          ...draft,
          primaryPath: workspace.currentPath || undefined,
        },
      );
      await reloadProjects();
      pushToast({
        tone: "success",
        title: `${response.project.name} created`,
        message:
          "Start a new chat in this project to confirm bot access. Existing chats are unchanged.",
      });
    },
    [pushToast, reloadProjects, workspace.currentPath],
  );

  const chooseRepositoryForConversation = useCallback(
    async (_targetSessionId?: string) => {
      try {
        // Picking a chat project must not switch or restart the shared engine.
        const result = await window.doolittle.pickProjectFolders();
        if (result.canceled) return;
        if (result.paths.length !== 1)
          throw new Error("Choose one project folder for this chat.");
        const repositoryPath = result.paths[0];
        if (!repositoryPath) return;
        let project = projects.find((entry) =>
          projectUsesPath(entry, repositoryPath, pathsEqual),
        );

        if (project?.archivedAt) {
          const restored = await desktopRequest<ProjectResponse>(
            `/projects/${encodeURIComponent(project.id)}/archive`,
            "POST",
            { archived: false },
          );
          project = restored.project;
        }

        if (!project) {
          const created = await desktopRequest<ProjectResponse>(
            "/projects",
            "POST",
            {
              name: workspaceName(repositoryPath),
              description: "Local repository workspace",
              primaryPath: repositoryPath,
            },
          );
          project = created.project;
        }

        const selectedProject = project;
        setProjects((current) => upsertProject(current, selectedProject));
        if (!startChatInProject)
          throw new Error("New chat action is unavailable.");
        await startChatInProject(selectedProject.id);
        pushToast({
          tone: "success",
          title: `Ready in ${selectedProject.name}`,
          message:
            "A new chat uses this repository. The earlier chat is unchanged.",
        });
      } catch (error) {
        pushToast({
          tone: "error",
          title: "Repository could not be opened",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [pathsEqual, projects, pushToast, setProjects, startChatInProject],
  );

  const updateProject = useCallback(
    async (project: ProjectLike, draft: ProjectDraft) => {
      const response = await desktopRequest<ProjectResponse>(
        `/projects/${encodeURIComponent(project.id)}`,
        "PATCH",
        draft,
      );
      setProjects((current) => replaceProject(current, response.project));
      pushToast({
        tone: "success",
        title: `${response.project.name} updated`,
        message: "Project context and instructions were saved locally.",
      });
    },
    [pushToast, setProjects],
  );

  const archiveProject = useCallback(
    async (project: ProjectLike, archived: boolean) => {
      const response = await desktopRequest<ProjectResponse>(
        `/projects/${encodeURIComponent(project.id)}/archive`,
        "POST",
        { archived },
      );
      setProjects((current) => replaceProject(current, response.project));
      if (archived && projectScope === project.id) selectProjectScope("all");
      pushToast({
        tone: "success",
        title: archived ? "Project archived" : "Project restored",
        message: `${response.project.name} ${
          archived ? "is hidden from active projects" : "is active again"
        }.`,
      });
    },
    [projectScope, pushToast, selectProjectScope, setProjects],
  );

  const pinProject = useCallback(
    async (project: ProjectLike, pinned: boolean) => {
      const response = await desktopRequest<ProjectResponse>(
        `/projects/${encodeURIComponent(project.id)}`,
        "PATCH",
        { pinned },
      );
      setProjects((current) => replaceProject(current, response.project));
    },
    [setProjects],
  );

  const addProjectResources = useCallback(
    async (project: ProjectLike, kind: "file" | "folder") => {
      const selection =
        kind === "file"
          ? await window.doolittle.pickProjectFiles()
          : await window.doolittle.pickProjectFolders();
      if (selection.canceled || selection.paths.length === 0) return;
      for (const path of selection.paths) {
        await desktopRequest(
          `/projects/${encodeURIComponent(project.id)}/resources`,
          "POST",
          { kind, label: workspaceName(path), value: path },
        );
      }
      const storedProject = projects.find((entry) => entry.id === project.id);
      if (kind === "folder" && !storedProject?.primaryPath) {
        await desktopRequest<ProjectResponse>(
          `/projects/${encodeURIComponent(project.id)}`,
          "PATCH",
          { primaryPath: selection.paths[0] },
        );
      }
      await reloadProjects();
      pushToast({
        tone: "success",
        title: `${selection.paths.length} ${
          kind === "file" ? "file" : "folder"
        }${selection.paths.length === 1 ? "" : "s"} added`,
        message: `Doolittle can now use ${
          selection.paths.length === 1 ? "this source" : "these sources"
        } as ${project.name} context.`,
      });
    },
    [projects, pushToast, reloadProjects],
  );

  const removeProjectResource = useCallback(
    async (project: ProjectLike, resource: ProjectResourceLike) => {
      await desktopRequest(
        `/projects/${encodeURIComponent(project.id)}/resources/${encodeURIComponent(
          resource.id,
        )}`,
        "DELETE",
      );
      await reloadProjects();
    },
    [reloadProjects],
  );

  const setProjectPrimaryPath = useCallback(
    async (project: ProjectLike, primaryPath: string) => {
      const response = await desktopRequest<ProjectResponse>(
        `/projects/${encodeURIComponent(project.id)}`,
        "PATCH",
        { primaryPath },
      );
      setProjects((current) => replaceProject(current, response.project));
      const canSwitch = workspace.recentPaths.some((path) =>
        pathsEqual(path, primaryPath),
      );
      if (!pathsEqual(primaryPath, workspace.currentPath) && canSwitch) {
        await switchToRecentWorkspace(primaryPath);
      }
      pushToast({
        tone: canSwitch ? "success" : "warning",
        title: `${workspaceName(primaryPath)} is primary`,
        message: canSwitch
          ? "New chats, Git operations, and project discovery now start from this folder."
          : "The project was updated. Open this folder once as a workspace before Doolittle can switch the private runtime automatically.",
      });
    },
    [
      pathsEqual,
      pushToast,
      setProjects,
      switchToRecentWorkspace,
      workspace.currentPath,
      workspace.recentPaths,
    ],
  );

  const moveCurrentChat = useCallback(
    async (projectId: string | null) => {
      if (!startChatInProject)
        throw new Error("New chat action is unavailable.");
      await startChatInProject(projectId);
      pushToast({
        tone: "success",
        title: "New conversation started",
        message: projectId
          ? "The earlier chat keeps its project; this new chat uses the selected project."
          : "The earlier chat keeps its project; this new chat is private scratch.",
      });
    },
    [pushToast, startChatInProject],
  );

  return {
    addProjectResources,
    archiveProject,
    chooseRepositoryForConversation,
    createProject,
    moveCurrentChat,
    pinProject,
    removeProjectResource,
    setProjectPrimaryPath,
    updateProject,
  };
}
