import {
  extractSessionContext,
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
} from "@elizaos/core";
import { messageUserId } from "@/runtime/message-user";
import { getEffectiveSkills } from "@/runtime/native/service-bridge/autonomous";
import {
  getEffectiveActivePersonality,
  getEffectiveUserProfile,
  listEffectiveUserProfiles,
} from "@/runtime/native/service-bridge/ownership";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import { getEffectiveToolInventory } from "@/runtime/native/service-bridge/service-resolution";
import { buildProjectPromptContext } from "@/runtime/prompt-cache";
import { renderDoolittleSoulContext } from "@/runtime/soul";
import type { AppServices } from "@/services";
import { renderIdentitySections } from "./sections/identity";
import { renderMemorySections } from "./sections/memory";
import { renderOperationSections } from "./sections/operations";
import { renderWorkspaceSections } from "./sections/workspace";

function sessionIdFor(message: Memory): string {
  return (
    extractSessionContext(message)?.sessionId ??
    String(message.roomId ?? "global")
  );
}

function renderUserProfileContext(
  runtime: IAgentRuntime,
  userId: string | undefined,
): string[] {
  if (!userId) return [];
  try {
    const profile = getEffectiveUserProfile(runtime, userId) as ReturnType<
      AppServices["userProfiles"]["get"]
    >;
    return [
      "DURABLE USER PROFILE",
      profile.displayName
        ? `savedDisplayName=${profile.displayName}`
        : "savedDisplayName=(not set)",
      ...(profile.aliases?.length
        ? [`aliases=${profile.aliases.slice(-3).join(", ")}`]
        : []),
      ...(profile.facts?.length
        ? [`facts=${profile.facts.slice(-5).join("; ")}`]
        : []),
      ...(profile.preferences?.length
        ? [`preferences=${profile.preferences.slice(-5).join("; ")}`]
        : []),
    ];
  } catch {
    return [];
  }
}

function renderSessionContext(
  services: AppServices,
  sessionId: string,
): string[] {
  try {
    const metadata = services.sessions.metadata(sessionId);
    return [
      "SESSION CONTEXT",
      `sessionId=${sessionId}`,
      ...(metadata?.title ? [`title=${metadata.title}`] : []),
      ...(metadata?.continuityKey
        ? [`continuityKey=${metadata.continuityKey}`]
        : []),
      ...(metadata?.parentSessionId
        ? [`parentSessionId=${metadata.parentSessionId}`]
        : []),
    ];
  } catch {
    return [
      "SESSION CONTEXT",
      `sessionId=${sessionId}`,
      "metadata=(unavailable)",
    ];
  }
}

function isDesktopTurn(message: Memory): boolean {
  const content = message.content as { source?: unknown };
  const metadata = message.metadata as
    | { doolittle?: { source?: unknown } }
    | undefined;
  return (
    content.source === "desktop" || metadata?.doolittle?.source === "desktop"
  );
}

function renderAcpEditorContext(
  services: AppServices,
  message: Memory,
): string[] {
  if (!isDesktopTurn(message)) return [];
  const latest = services.acp.latestEditorContext(services.workspace.root());
  if (!latest) return [];
  const context = latest.context;
  return [
    "ACP EDITOR CONTEXT",
    `workspace=${latest.workspaceRoot}`,
    `updatedAt=${latest.updatedAt}`,
    ...(context.path ? [`path=${context.path}`] : []),
    ...(context.uri ? [`uri=${context.uri}`] : []),
    ...(context.language ? [`language=${context.language}`] : []),
    ...(context.version !== undefined ? [`version=${context.version}`] : []),
    ...(context.dirty !== undefined ? [`dirty=${context.dirty}`] : []),
    ...(context.focused !== undefined ? [`focused=${context.focused}`] : []),
    ...(context.cursor ? [`cursor=${JSON.stringify(context.cursor)}`] : []),
    ...(context.selection
      ? [`selection=${JSON.stringify(context.selection)}`]
      : []),
    ...(context.visibleRanges?.length
      ? [`visibleRanges=${JSON.stringify(context.visibleRanges)}`]
      : []),
    ...(context.content
      ? [`content:\n${context.content.slice(0, 16_000)}`]
      : []),
    ...(context.resources?.length
      ? [`resources=${JSON.stringify(context.resources).slice(0, 16_000)}`]
      : []),
  ];
}

function coreContextResult(
  services: AppServices,
  runtime: IAgentRuntime,
  message: Memory,
): ProviderResult {
  const sessionId = sessionIdFor(message);
  const personality = getEffectiveActivePersonality(runtime);
  const settings = services.settings.get();
  const memorySummary = services.memory.summary("memory");
  const userId = messageUserId(message);
  const userSummary = services.memory.summary("user", userId);
  const projectContext = buildProjectPromptContext({
    sessions: services.sessions,
    sessionId,
    workspaceDir: services.workspace.root(),
  });
  const userProfileContext = renderUserProfileContext(runtime, userId);
  const soulContext = renderDoolittleSoulContext(services.workspace.root());
  const editorContext = renderAcpEditorContext(services, message);

  return {
    text: [
      ...renderMemorySections(memorySummary, userSummary),
      ...(userProfileContext.length ? ["", ...userProfileContext] : []),
      "",
      ...renderIdentitySections(personality, settings),
      ...(soulContext.length ? ["", ...soulContext] : []),
      "",
      ...renderSessionContext(services, sessionId),
      ...(projectContext ? ["", projectContext] : []),
      ...(editorContext.length ? ["", ...editorContext] : []),
    ].join("\n"),
    values: {},
    data: {
      sessionId,
      personality: personality.id,
      hasProjectContext: Boolean(projectContext),
      hasEditorContext: editorContext.length > 0,
    },
  };
}

async function workspaceContextResult(
  services: AppServices,
  runtime: IAgentRuntime,
): Promise<ProviderResult> {
  const skillEntries = getEffectiveSkills(runtime, services);
  const recentTerminal = services.terminal.recent(5);
  let repoSummary = "";
  try {
    repoSummary = await services.repository.status();
  } catch (error) {
    repoSummary = `Repository status unavailable: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }

  return {
    text: renderWorkspaceSections({
      contextFiles: services.contextFiles.render(),
      skillEntries,
      workspaceSummary: services.workspace.summary(16),
      recentTerminal,
      repoSummary,
    }).join("\n"),
    values: {},
    data: {
      skillsCount: skillEntries.length,
      terminalCommands: recentTerminal.length,
    },
  };
}

async function operationsContextResult(
  services: AppServices,
  runtime: IAgentRuntime,
): Promise<ProviderResult> {
  try {
    const cron = getNativeServices(runtime).automation;
    if (!cron) {
      throw new Error("Trigger runtime service is not ready.");
    }
    const cronJobs = await cron.list();
    const enabledTools = getEffectiveToolInventory(
      runtime,
      services,
    ).tools.filter((tool) => tool.enabled);
    const delegationTasks = services.delegationProjection.list();
    const delegationOverview = services.delegationProjection.overview();
    const delegationWorkers = services.delegationProjection.workers(5);
    const userProfileEntries = listEffectiveUserProfiles(runtime) as ReturnType<
      AppServices["userProfiles"]["list"]
    >;

    return {
      text: renderOperationSections({
        cronJobs,
        enabledTools,
        delegationTasks,
        delegationOverview,
        delegationWorkers,
        userProfileEntries,
      }).join("\n"),
      values: {},
      data: {
        cronJobs: cronJobs.length,
        enabledTools: enabledTools.length,
        delegationTasks: delegationTasks.length,
      },
    };
  } catch (error) {
    return {
      text: "OPERATIONS CONTEXT\n(unavailable)",
      values: {},
      data: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Doolittle's provider surface is split by SDK routing context. The core
 * provider deliberately remains in every Stage-1 response state; workspace
 * and operations data only participate when Eliza selects their contexts.
 */
export function createAgentContextProviders(services: AppServices): Provider[] {
  const coreProvider: Provider = {
    name: "DOOLITTLE_CORE_CONTEXT_PROVIDER",
    description:
      "Provides Doolittle identity, memory, session, and project context.",
    contexts: ["general", "memory", "character", "state"],
    alwaysInResponseState: true,
    cacheStable: false,
    cacheScope: "room",
    get: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state: State,
    ): Promise<ProviderResult> => coreContextResult(services, runtime, message),
  };

  const workspaceProvider: Provider = {
    name: "DOOLITTLE_WORKSPACE_CONTEXT_PROVIDER",
    description: "Provides workspace, file, code, skill, and terminal context.",
    contexts: ["code", "files", "terminal"],
    contextGate: { anyOf: ["code", "files", "terminal"] },
    cacheStable: false,
    cacheScope: "turn",
    get: async (runtime: IAgentRuntime): Promise<ProviderResult> =>
      workspaceContextResult(services, runtime),
  };

  const operationsProvider: Provider = {
    name: "DOOLITTLE_OPERATIONS_CONTEXT_PROVIDER",
    description:
      "Provides scheduler, tools, delegation, and profile operations context.",
    contexts: ["automation", "settings", "admin"],
    contextGate: { anyOf: ["automation", "settings", "admin"] },
    cacheStable: false,
    cacheScope: "turn",
    get: async (runtime: IAgentRuntime): Promise<ProviderResult> =>
      operationsContextResult(services, runtime),
  };

  return [coreProvider, workspaceProvider, operationsProvider];
}
