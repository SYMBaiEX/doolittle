import type { BackendPhase, SessionSummary } from "../../shared/contracts";
import type { CommandGroup } from "../components/CommandPalette";
import type { ProjectLike, ProjectScope } from "../components/ProjectManager";
import {
  navigation,
  sessionLabel,
  VIEW_DESCRIPTIONS,
  type View,
  workspaceName,
} from "../desktop-navigation";
import { displayTimestamp } from "../lib";

export interface DesktopCommandGroupsContext {
  paletteQuery: string;
  backendPhase: BackendPhase;
  resolvedAppearance: "dark" | "light";
  navCollapsed: boolean;
  platform: "darwin" | "win32" | "linux";
  runningTasks: number;
  sessionsCount: number;
  workspacePath: string;
  recentWorkspacePaths: readonly string[];
  searchCommandGroups: readonly CommandGroup[];
  sidebarSessions: readonly SessionSummary[];
  projectCards: readonly ProjectLike[];
  onOpenSession: (sessionId: string) => void;
  onChooseRepository: () => void | Promise<void>;
  onSwitchRecentWorkspace: (path: string) => Promise<boolean>;
  onSetView: (view: View) => void;
  onSelectProjectScope: (scope: ProjectScope) => void;
  onOpenProjectManager: () => void;
  onCreateConversation: () => void;
  onRefresh: () => void | Promise<void>;
  onToggleAppearance: () => void;
  onToggleNavigation: () => void;
}

export function buildDesktopCommandGroups({
  backendPhase,
  navCollapsed,
  onChooseRepository,
  onCreateConversation,
  onOpenProjectManager,
  onOpenSession,
  onRefresh,
  onSelectProjectScope,
  onSetView,
  onSwitchRecentWorkspace,
  onToggleAppearance,
  onToggleNavigation,
  paletteQuery,
  platform,
  projectCards,
  recentWorkspacePaths,
  resolvedAppearance,
  runningTasks,
  searchCommandGroups,
  sessionsCount,
  sidebarSessions,
  workspacePath,
}: DesktopCommandGroupsContext): CommandGroup[] {
  return [
    ...(paletteQuery.trim()
      ? []
      : [
          {
            id: "recents",
            label: "Recents",
            items: [
              ...sidebarSessions.map((session) => ({
                id: `recent-${session.sessionId}`,
                label: sessionLabel(session),
                description:
                  session.messageCount > 0
                    ? `${session.messageCount} messages · ${
                        session.endedAt
                          ? displayTimestamp(session.endedAt)
                          : "active locally"
                      }`
                    : "Draft conversation",
                keywords: ["recent", "conversation", session.sessionId],
                onSelect: () => onOpenSession(session.sessionId),
              })),
              {
                id: "recent-open-workspace",
                label: "Choose repository for new chat",
                description: workspacePath || "Choose a local folder",
                keywords: ["workspace", "open", "project", "repository"],
                onSelect: () => void onChooseRepository(),
              },
              ...recentWorkspacePaths
                .filter((path) => path !== workspacePath)
                .map((path) => ({
                  id: `workspace-${path}`,
                  label: workspaceName(path),
                  description: path,
                  keywords: ["workspace", "recent", "project", path],
                  onSelect: () => void onSwitchRecentWorkspace(path),
                })),
              {
                id: "recent-live-tasks",
                label: "Open live tasks",
                description:
                  runningTasks > 0
                    ? `${runningTasks} running task${
                        runningTasks === 1 ? "" : "s"
                      }`
                    : "No active tasks right now",
                keywords: ["tasks", "agents", "running"],
                onSelect: () => onSetView("orchestration"),
              },
            ],
          },
          {
            id: "projects",
            label: "Projects",
            items: [
              {
                id: "project-all",
                label: "All chats",
                description: `${sessionsCount} conversations across every project`,
                keywords: ["projects", "global", "all chats"],
                onSelect: () => onSelectProjectScope("all"),
              },
              ...projectCards
                .filter((project) => !project.archived)
                .map((project) => ({
                  id: `project-${project.id}`,
                  label: project.name,
                  description: `${project.chatCount ?? 0} conversations${
                    project.description ? ` · ${project.description}` : ""
                  }`,
                  keywords: [
                    "project",
                    project.name,
                    project.description ?? "",
                  ],
                  onSelect: () => onSelectProjectScope(project.id),
                })),
              {
                id: "project-manage",
                label: "Manage projects",
                description: "Create, edit, archive, and attach local sources",
                keywords: ["project", "files", "folders", "manage"],
                onSelect: onOpenProjectManager,
              },
            ],
          },
        ]),
    ...searchCommandGroups,
    {
      id: "actions",
      label: "Actions",
      items: [
        {
          id: "new-chat",
          label: "New conversation",
          description: "Start with a clean context",
          keywords: ["compose", "new", "chat"],
          shortcuts: [platform === "darwin" ? "⌘ N" : "Ctrl N"],
          onSelect: onCreateConversation,
        },
        {
          id: "refresh",
          label: "Refresh local runtime",
          description: "Reload runtime and session state",
          keywords: ["reload", "health"],
          disabled: backendPhase !== "ready",
          onSelect: () => void onRefresh(),
        },
        {
          id: "open-workspace",
          label: "Choose repository for new chat",
          description: "Open a repo, link it to a project, and start chatting",
          keywords: ["project", "folder", "repository", "switch"],
          shortcuts: [platform === "darwin" ? "⌘ O" : "Ctrl O"],
          onSelect: () => void onChooseRepository(),
        },
        {
          id: "appearance",
          label: `Use ${resolvedAppearance === "dark" ? "light" : "dark"} appearance`,
          description: "Switch the desktop color mode",
          keywords: ["theme", "dark", "light"],
          onSelect: onToggleAppearance,
        },
        {
          id: "navigation",
          label: `${navCollapsed ? "Expand" : "Collapse"} navigation`,
          description: "Change the sidebar density",
          shortcuts: [platform === "darwin" ? "⌘ ⇧ B" : "Ctrl ⇧ B"],
          onSelect: onToggleNavigation,
        },
      ],
    },
    ...navigation.map((section) => ({
      id: section.id,
      label: section.label,
      items: section.items.map((item) => ({
        id: `view-${item.id}`,
        label: item.label,
        description: VIEW_DESCRIPTIONS[item.id],
        keywords: [section.label, item.id],
        onSelect: () => onSetView(item.id),
      })),
    })),
  ];
}
