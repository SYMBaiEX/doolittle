import type { BotSummary } from "@doolittle/contracts/bots";
import type { ReactNode } from "react";
import type {
  BackendState,
  BotConversationScope,
  RuntimeStatus,
  SessionSummary,
  WorkspacePickResult,
} from "../../shared/contracts";
import type {
  ChatContextHandoff,
  ChatContextRequest,
} from "../chat-context-handoff";
import {
  type ComputerOrigin,
  computerOriginKey,
  sameComputerOrigin,
} from "../computer-origin";
import { renderedViewForView, type View } from "../desktop-navigation";
import type { DesktopNavigationIntent } from "../desktop-navigation-intent";
import { type ApiResource, LoadingBlock } from "../lib";
import type { LinkedWorkTab, WorkTabId } from "../OrchestrationPage";
import type { ProjectLike, ProjectScope } from "../project-manager/models";
import type { SessionConversationScope } from "../session-conversation-scope";
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
import "./route-documents.css";

const LINKED_WORK_VIEWS = [
  ["review", "review"],
  ["automations", "automations"],
  ["agents", "agents"],
  ["inbox", "gateway"],
] as const satisfies ReadonlyArray<readonly [LinkedWorkTab, View]>;

export interface DesktopRouteNavigation {
  setView: (view: View) => void;
  selectSession: (sessionId: string) => void;
  openSession: (sessionId: string) => void;
  chooseRepositoryForConversation: (
    targetSessionId?: string,
    destination?: "chat" | "code",
    hasUnsavedChanges?: boolean,
    expectedWorkspacePath?: string,
  ) => Promise<BotConversationScope | undefined>;
  createConversation: () => void;
  startLeadConversation: () => void;
  startChatInProject: (
    projectId: string | null,
    sourceSessionId?: string,
  ) => Promise<void>;
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
  openWorkspaceFile: (path: string, origin?: ComputerOrigin) => void;
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
  scopeForSession?: (sessionId: string) => SessionConversationScope;
  onConfirmConversationScope?: (scope: BotConversationScope) => void;
  onSessionSummary?: (summary: SessionSummary) => void;
  onBindSessionBot: (sessionId: string, botId: string) => void;
  onCaptureSessionProject?: (
    sessionId: string,
    projectId: string | null,
  ) => void;
  onActivateBot: (botId: string) => Promise<void>;
  pendingApprovals: number;
  runningTasks: number;
  pendingNavigationIntent: DesktopNavigationIntent | null;
  pendingContextHandoff: ChatContextHandoff | null;
  onConsumeContextHandoff: (id: string) => void;
  onCodeWorkspaceDirtyChange?: (dirty: boolean) => void;
  codeEditingLocked: boolean;
  chatChromeHost: HTMLElement | null;
  chatRouteActive?: boolean;
  terminalOpen?: boolean;
  routeVisible?: boolean;
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
  terminalOpen = false,
  routeVisible = true,
  codeEditingLocked,
  navigation,
  onConsumeContextHandoff,
  onCodeWorkspaceDirtyChange,
  pendingApprovals,
  pendingContextHandoff,
  pendingNavigationIntent,
  projectCards,
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
  scopeForSession,
  onConfirmConversationScope,
  onSessionSummary,
  onBindSessionBot,
  onCaptureSessionProject,
  onActivateBot,
  view,
  workspacePath,
  computerOrigin,
}: DesktopRouteContentProps): ReactNode {
  const routeCapabilities = desktopRouteCapabilities(view, backend.phase);
  const active = routeVisible && routeCapabilities.apiRead;
  const routeOwner = renderedViewForView(view);
  const Route = getDesktopRouteComponent(routeOwner);
  const focusScope = desktopRouteFocusScope(
    computerOrigin?.workspacePath ?? workspacePath,
    routeOwner === "code" ? "all" : projectScope,
    routeOwner === "code" ? computerOriginKey(computerOrigin) : undefined,
  );
  const focusForScope = routeFocus.get(focusScope);

  const content = (() => {
    switch (routeOwner) {
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
            onSelectProjectForNewChat={(
              scope: ProjectScope,
              sourceSessionId?: string,
            ) =>
              void navigation.startChatInProject(
                scope === "all" || scope === "unscoped" ? null : scope,
                sourceSessionId ?? selectedSession,
              )
            }
            onSelect={navigation.selectSession}
            onOpenModelsPage={() => navigation.setView("models")}
            onOpenSettings={() => navigation.setView("settings")}
            onOpenProvidersPage={() => navigation.setView("connections")}
            onOpenWorkspaceView={
              navigation.openComputerView ?? navigation.setView
            }
            onConsumeContextHandoff={onConsumeContextHandoff}
            pendingApprovals={pendingApprovals}
            pendingContextHandoff={pendingContextHandoff}
            projects={projectCards}
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
            scopeForSession={scopeForSession}
            onConfirmConversationScope={onConfirmConversationScope}
            onSessionSummary={onSessionSummary}
            onBindSessionBot={onBindSessionBot}
            onCaptureSessionProject={onCaptureSessionProject}
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
      case "code": {
        if (!computerOrigin)
          return (
            <LoadingBlock label="Resolving this conversation’s Computer access…" />
          );
        const chooseRepository = async (
          hasUnsavedChanges?: boolean,
          expectedWorkspacePath?: string,
        ): Promise<WorkspacePickResult> => {
          const conversation = await navigation.chooseRepositoryForConversation(
            computerOrigin.originConversationId,
            "code",
            hasUnsavedChanges,
            expectedWorkspacePath,
          );
          return {
            canceled: !conversation,
            state: {
              currentPath:
                conversation?.workspacePath ?? computerOrigin.workspacePath,
              recentPaths: [],
            },
          };
        };
        return (
          <Route
            active={active}
            visible={routeVisible}
            canCreateWorktree={Boolean(
              bots.find((bot) =>
                computerOrigin.botId === "default"
                  ? bot.isDefault
                  : bot.id === computerOrigin.botId,
              )?.permissions.allowMutation,
            )}
            editingLocked={codeEditingLocked}
            key={focusScope}
            origin={computerOrigin}
            previewEvidenceAvailable={
              computerOrigin.botId === defaultBotId ||
              computerOrigin.botId === "default"
            }
            focusState={focusForScope?.code}
            onFocusStateChange={(state: CodingWorkspaceFocusState) => {
              const current = routeFocus.get(focusScope) ?? {};
              routeFocus.set(focusScope, { ...current, code: state });
            }}
            navigationIntent={
              pendingNavigationIntent?.kind === "workspace-file" &&
              sameComputerOrigin(
                pendingNavigationIntent.target.origin,
                computerOrigin,
              )
                ? pendingNavigationIntent
                : null
            }
            onAcknowledgeNavigationIntent={navigation.consumeNavigationIntent}
            onChooseWorkspace={(dirty?: boolean) => chooseRepository(dirty)}
            onOpenWorkspacePath={(path: string, dirty?: boolean) =>
              chooseRepository(dirty, path)
            }
            onOpenChatTerminal={navigation.openChatTerminal}
            terminalOpen={terminalOpen}
            onDirtyChange={onCodeWorkspaceDirtyChange}
            onSendToChat={navigation.openChatWithContext}
            projectScope={projectScope}
            surface={view === "browser" ? "preview" : "workspace"}
            onSurfaceChange={(surface: string) =>
              navigation.setView(surface === "preview" ? "browser" : "code")
            }
          />
        );
      }
      case "orchestration": {
        const workScope = scopeForSession?.(selectedSession);
        const matchesWorkProject = (projectId?: string) =>
          projectScope === "all" ||
          (projectScope === "unscoped"
            ? !projectId
            : projectScope === projectId);
        const workOrigin =
          workScope?.kind === "confirmed" &&
          matchesWorkProject(workScope.conversation.projectId)
            ? {
                botId: workScope.conversation.botId,
                originConversationId: selectedSession,
                workspacePath: workScope.conversation.workspacePath,
              }
            : undefined;
        const lead = bots.find((bot) => bot.isDefault);
        const leadCanDelegate = lead?.permissions.allowDelegation ?? false;
        const delegationReady =
          leadCanDelegate &&
          Boolean(workOrigin?.workspacePath) &&
          (workOrigin?.botId === lead?.id || workOrigin?.botId === "default");
        const openLeadChat = () => {
          const session = (sessionMetadata ?? scopedSessions).find((entry) => {
            if ((entry.botId ?? defaultBotId) !== lead?.id) return false;
            const scope = scopeForSession?.(entry.sessionId);
            return (
              scope?.kind === "confirmed" &&
              Boolean(scope.conversation.workspacePath) &&
              matchesWorkProject(scope.conversation.projectId)
            );
          });
          if (session) navigation.openSession(session.sessionId);
          else navigation.startLeadConversation();
        };
        return (
          <Route
            active={active}
            delegationReady={delegationReady}
            delegationBlockReason={
              lead
                ? leadCanDelegate
                  ? `Open a workspace chat with ${lead.name} (Lead) before starting or changing delegated tasks.`
                  : `Delegation is disabled for ${lead.name} (Lead).`
                : "Waiting for the Lead bot's permissions."
            }
            key={`${workspacePath}\u0000${projectScope}`}
            focusState={focusForScope?.work}
            onFocusStateChange={(state: OrchestrationFocusState) => {
              const current = routeFocus.get(focusScope) ?? {};
              routeFocus.set(focusScope, { ...current, work: state });
            }}
            navigationIntent={pendingNavigationIntent}
            onAcknowledgeNavigationIntent={navigation.consumeNavigationIntent}
            onSectionChange={(section: WorkTabId) => {
              const targetView =
                LINKED_WORK_VIEWS.find(([tab]) => tab === section)?.[1] ??
                "orchestration";
              if (targetView !== view) navigation.setView(targetView);
            }}
            onSendToChat={navigation.openChatWithContext}
            onOpenLeadChat={leadCanDelegate ? openLeadChat : undefined}
            onOpenWorkspaceFile={navigation.openWorkspaceFile}
            projectScope={projectScope}
            requestedTab={
              LINKED_WORK_VIEWS.find(([, target]) => target === view)?.[0]
            }
            workspaceLabel={
              activeProject?.name ??
              (projectScope === "unscoped" ? "General" : "All projects")
            }
            workspacePath={workOrigin?.workspacePath}
            computerOrigin={workOrigin}
          />
        );
      }
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
        return (
          <Route
            active={active}
            runtimeLogIntent={
              view === "logs" && pendingNavigationIntent?.kind === "runtime-log"
                ? pendingNavigationIntent
                : null
            }
            onConsumeNavigationIntent={navigation.consumeNavigationIntent}
            onSectionChange={(section: string) =>
              navigation.setView(settingsViewForSection(section))
            }
            refreshRuntime={refreshRuntime}
            runtime={runtime}
            section={settingsSectionForView(view) ?? "appearance"}
            writesAllowed={routeCapabilities.writes}
          />
        );
    }
  })();

  return (
    <div
      className={`contents ${VIEW_PRIMITIVES_CLASS}`}
      data-route-document={
        routeOwner === "chat" || routeOwner === "code" ? undefined : routeOwner
      }
    >
      {content}
    </div>
  );
}
