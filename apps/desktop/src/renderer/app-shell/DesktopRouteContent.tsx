import type { BotSummary } from "@doolittle/contracts/bots";
import type { ReactNode } from "react";
import type {
  BackendState,
  RuntimeStatus,
  SessionSummary,
  WorkspacePickResult,
} from "../../shared/contracts";
import type {
  ChatContextHandoff,
  ChatContextRequest,
} from "../chat-context-handoff";
import { type ComputerOrigin, computerOriginKey } from "../computer-origin";
import { renderedViewForView, type View } from "../desktop-navigation";
import type { DesktopNavigationIntent } from "../desktop-navigation-intent";
import { type ApiResource, LoadingBlock } from "../lib";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import {
  settingsSectionForView,
  settingsViewForSection,
} from "../settings/settings-sections";
import { desktopRouteCapabilities } from "./desktop-route-capabilities";
import { getDesktopRouteComponent } from "./desktop-route-registry";
import {
  type CodingWorkspaceFocusState,
  type DesktopRouteFocusStore,
  desktopRouteFocusScope,
  type OrchestrationFocusState,
} from "./route-focus-state";
import { VIEW_PRIMITIVES_CLASS } from "./view-layout";

export interface DesktopRouteNavigation {
  setView: (view: View) => void;
  selectSession: (sessionId: string) => void;
  openSession: (sessionId: string) => void;
  chooseRepositoryForConversation: (
    targetSessionId?: string,
  ) => void | Promise<void>;
  createConversation: () => void;
  openChatTerminal: () => void;
  openComputerView?: (view: View, origin?: ComputerOrigin) => void;
  transitionToProjectScope: (
    scope: ProjectScope,
    sessionId: string,
    nextView?: View,
    onActivated?: () => boolean | undefined,
  ) => Promise<boolean>;
  consumeNavigationIntent: (id: string) => void;
  openChatWithContext: (request: ChatContextRequest) => Promise<boolean>;
  openProjectManager: () => void;
  openWorkspaceFile: (path: string) => void;
}

export interface DesktopRouteContentProps {
  view: View;
  backend: BackendState;
  runtime: RuntimeStatus | null;
  activeProject: Pick<
    ProjectLike,
    "id" | "name" | "color" | "primaryPath"
  > | null;
  projectCards: readonly ProjectLike[];
  projectLabels: Readonly<Record<string, string>>;
  projectScope: ProjectScope;
  scopedSessions: SessionSummary[];
  sessionMetadata?: SessionSummary[];
  selectedSession: string;
  selectedBotId: string;
  bots: readonly BotSummary[];
  defaultBotId: string;
  botIdForSession: (sessionId: string) => string;
  projectTargetForSession?: (
    sessionId: string,
  ) => { projectId?: string } | undefined;
  onBindSessionBot: (sessionId: string, botId: string) => void;
  onActivateBot: (botId: string) => Promise<void>;
  pendingApprovals: number;
  runningTasks: number;
  pendingNavigationIntent: DesktopNavigationIntent | null;
  pendingContextHandoff: ChatContextHandoff | null;
  onConsumeContextHandoff: (id: string) => void;
  onChooseWorkspace: () => Promise<WorkspacePickResult>;
  onOpenWorkspacePath: (path: string) => Promise<WorkspacePickResult>;
  onCodeWorkspaceDirtyChange?: (dirty: boolean) => void;
  codeEditingLocked: boolean;
  chatChromeHost: HTMLElement | null;
  chatRouteActive?: boolean;
  workspacePath: string;
  computerOrigin?: ComputerOrigin;
  approvalsResource: ApiResource<{ approvals?: unknown[] }>;
  tasksResource: ApiResource<{ tasks?: unknown[] }>;
  refreshRuntime: () => Promise<boolean>;
  navigation: DesktopRouteNavigation;
  routeFocus: DesktopRouteFocusStore;
}

export function DesktopRouteContent({
  activeProject,
  approvalsResource,
  tasksResource,
  backend,
  chatChromeHost,
  chatRouteActive = true,
  codeEditingLocked,
  navigation,
  onChooseWorkspace,
  onConsumeContextHandoff,
  onOpenWorkspacePath,
  onCodeWorkspaceDirtyChange,
  pendingApprovals,
  pendingContextHandoff,
  pendingNavigationIntent,
  projectCards,
  projectLabels,
  projectScope,
  refreshRuntime,
  runtime,
  routeFocus,
  runningTasks,
  scopedSessions,
  sessionMetadata,
  selectedSession,
  selectedBotId,
  bots,
  defaultBotId,
  botIdForSession,
  projectTargetForSession,
  onBindSessionBot,
  onActivateBot,
  view,
  workspacePath,
  computerOrigin,
}: DesktopRouteContentProps): ReactNode {
  const routeCapabilities = desktopRouteCapabilities(view, backend.phase);
  const active = routeCapabilities.apiRead;
  const settingsSection = settingsSectionForView(view);
  const Route = getDesktopRouteComponent(renderedViewForView(view));
  const focusScope = desktopRouteFocusScope(
    computerOrigin?.workspacePath ?? workspacePath,
    projectScope,
    view === "code" || view === "browser"
      ? computerOriginKey(computerOrigin)
      : undefined,
  );
  const focusForScope = routeFocus.get(focusScope);

  const content = (() => {
    switch (view) {
      case "dashboard":
        return (
          <Route
            active={active}
            approvalsResource={approvalsResource}
            tasksResource={tasksResource}
            runtime={runtime}
            sessions={scopedSessions}
            workspacePath={workspacePath}
            refreshRuntime={refreshRuntime}
            onOpenChat={(sessionId: string) => {
              if (sessionId) navigation.openSession(sessionId);
              else navigation.setView("chat");
            }}
            onOpenReview={() => navigation.setView("review")}
            onOpenSetup={() => navigation.setView("operatorSetup")}
            onOpenTasks={() => navigation.setView("orchestration")}
            onOpenProviders={() => navigation.setView("connections")}
          />
        );
      case "chat":
      case "sessions":
      case "media":
        return (
          <Route
            activeProject={activeProject}
            backend={backend}
            onChooseRepository={(sessionId?: string) =>
              navigation.chooseRepositoryForConversation(
                sessionId ?? selectedSession,
              )
            }
            onOpenProjectManager={navigation.openProjectManager}
            onRequestNewConversation={navigation.createConversation}
            onActivateSessionProject={(
              sessionId: string,
              projectId: string,
            ) => {
              void navigation.transitionToProjectScope(
                projectId,
                sessionId,
                "chat",
              );
            }}
            onSelectProjectForNewChat={(scope: ProjectScope) =>
              navigation.transitionToProjectScope(
                scope,
                selectedSession,
                "chat",
              )
            }
            onSelect={navigation.selectSession}
            onOpenModelsPage={() => navigation.setView("models")}
            onOpenProvidersPage={() => navigation.setView("connections")}
            onOpenWorkspaceView={
              navigation.openComputerView ?? navigation.setView
            }
            onConsumeContextHandoff={onConsumeContextHandoff}
            pendingApprovals={pendingApprovals}
            pendingContextHandoff={pendingContextHandoff}
            projects={projectCards}
            projectLabels={projectLabels}
            refreshRuntime={refreshRuntime}
            remoteSessions={scopedSessions}
            routeActive={chatRouteActive}
            sessionMetadata={sessionMetadata}
            runningTasks={runningTasks}
            runtime={runtime}
            selectedId={selectedSession}
            selectedBotId={selectedBotId}
            bots={bots}
            defaultBotId={defaultBotId}
            botIdForSession={botIdForSession}
            projectTargetForSession={projectTargetForSession}
            onBindSessionBot={onBindSessionBot}
            onActivateBot={onActivateBot}
            surface={
              view === "sessions"
                ? "history"
                : view === "media"
                  ? "media"
                  : "conversation"
            }
            onSurfaceChange={(surface: string) =>
              navigation.setView(
                surface === "history"
                  ? "sessions"
                  : surface === "media"
                    ? "media"
                    : "chat",
              )
            }
            chromeHost={chatChromeHost}
            workspacePath={workspacePath}
          />
        );
      case "code":
      case "browser":
        if (!computerOrigin)
          return (
            <LoadingBlock label="Resolving this conversation’s Computer access…" />
          );
        return (
          <Route
            active={active}
            editingLocked={codeEditingLocked}
            key={focusScope}
            botId={computerOrigin?.botId}
            originConversationId={computerOrigin?.originConversationId}
            focusState={focusForScope?.code}
            onFocusStateChange={(state: CodingWorkspaceFocusState) => {
              const current = routeFocus.get(focusScope) ?? {};
              routeFocus.set(focusScope, { ...current, code: state });
            }}
            navigationIntent={pendingNavigationIntent}
            onAcknowledgeNavigationIntent={navigation.consumeNavigationIntent}
            onChooseWorkspace={onChooseWorkspace}
            onOpenWorkspacePath={onOpenWorkspacePath}
            onOpenChatTerminal={navigation.openChatTerminal}
            onDirtyChange={onCodeWorkspaceDirtyChange}
            onSendToChat={navigation.openChatWithContext}
            projectScope={projectScope}
            surface={view === "browser" ? "preview" : "workspace"}
            onSurfaceChange={(surface: string) =>
              navigation.setView(surface === "preview" ? "browser" : "code")
            }
            workspacePath={computerOrigin?.workspacePath ?? workspacePath}
          />
        );
      case "gateway":
      case "automations":
      case "review":
      case "orchestration":
        return (
          <Route
            active={active}
            key={`${workspacePath}\u0000${projectScope}`}
            focusState={focusForScope?.work}
            onFocusStateChange={(state: OrchestrationFocusState) => {
              const current = routeFocus.get(focusScope) ?? {};
              routeFocus.set(focusScope, { ...current, work: state });
            }}
            navigationIntent={pendingNavigationIntent}
            onAcknowledgeNavigationIntent={navigation.consumeNavigationIntent}
            onSectionChange={(section: string) => {
              const targetView =
                section === "review"
                  ? "review"
                  : section === "automations"
                    ? "automations"
                    : section === "inbox"
                      ? "gateway"
                      : "orchestration";
              if (targetView !== view) navigation.setView(targetView);
            }}
            onSendToChat={navigation.openChatWithContext}
            onOpenWorkspaceFile={navigation.openWorkspaceFile}
            projectScope={projectScope}
            requestedTab={
              view === "review"
                ? "review"
                : view === "automations"
                  ? "automations"
                  : view === "gateway"
                    ? "inbox"
                    : undefined
            }
            workspaceLabel={
              activeProject?.name ??
              (projectScope === "unscoped" ? "General" : "All projects")
            }
            workspacePath={workspacePath}
          />
        );
      case "activity":
        return <Route active={active} />;
      case "analytics":
        return (
          <Route
            active={active}
            onNewConversation={navigation.createConversation}
          />
        );
      case "settings":
      case "models":
      case "connections":
      case "keys":
      case "tools":
      case "skills":
      case "plugins":
      case "memory":
      case "profiles":
      case "logs":
      case "runtime":
      case "compatibility":
      case "registry":
      case "operatorSetup":
      case "docs":
        return (
          <Route
            active={active}
            onSectionChange={(section: string) =>
              navigation.setView(settingsViewForSection(section))
            }
            refreshRuntime={refreshRuntime}
            runtime={runtime}
            section={settingsSection}
            writesAllowed={routeCapabilities.writes}
          />
        );
      default:
        return null;
    }
  })();

  return <div className={`contents ${VIEW_PRIMITIVES_CLASS}`}>{content}</div>;
}
