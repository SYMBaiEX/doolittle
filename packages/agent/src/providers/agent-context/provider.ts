import {
  extractSessionContext,
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
} from "@elizaos/core";
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

function userIdFor(message: Memory): string | undefined {
  const metadata = message.metadata as
    | { doolittle?: { userId?: unknown } }
    | undefined;
  const userId = metadata?.doolittle?.userId;
  return typeof userId === "string" && userId.trim()
    ? userId.trim()
    : undefined;
}

function renderUserProfileContext(
  services: AppServices,
  userId: string | undefined,
): string[] {
  if (!userId) return [];
  try {
    const profile = services.userProfiles.get(userId);
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

function coreContextResult(
  services: AppServices,
  message: Memory,
): ProviderResult {
  const sessionId = sessionIdFor(message);
  const personality = services.personalities.getActive();
  const settings = services.settings.get();
  const memorySummary = services.memory.summary("memory");
  const userSummary = services.memory.summary("user");
  const projectContext = buildProjectPromptContext({
    sessions: services.sessions,
    sessionId,
    workspaceDir: services.workspace.root(),
  });
  const userProfileContext = renderUserProfileContext(
    services,
    userIdFor(message),
  );
  const soulContext = renderDoolittleSoulContext(services.workspace.root());

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
    ].join("\n"),
    values: {},
    data: {
      sessionId,
      personality: personality.id,
      hasProjectContext: Boolean(projectContext),
    },
  };
}

async function workspaceContextResult(
  services: AppServices,
): Promise<ProviderResult> {
  const skillEntries = services.skills.list();
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
): Promise<ProviderResult> {
  try {
    const cronJobs = services.cron.list();
    const enabledTools = services.tools.enabled();
    const delegationTasks = services.delegation.list();
    const delegationOverview = services.delegation.overview();
    const delegationWorkers = services.delegation.workers(5);
    const userProfileEntries = services.userProfiles.list();

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
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State,
    ): Promise<ProviderResult> => coreContextResult(services, message),
  };

  const workspaceProvider: Provider = {
    name: "DOOLITTLE_WORKSPACE_CONTEXT_PROVIDER",
    description: "Provides workspace, file, code, skill, and terminal context.",
    contexts: ["code", "files", "terminal"],
    contextGate: { anyOf: ["code", "files", "terminal"] },
    cacheStable: false,
    cacheScope: "turn",
    get: async (): Promise<ProviderResult> => workspaceContextResult(services),
  };

  const operationsProvider: Provider = {
    name: "DOOLITTLE_OPERATIONS_CONTEXT_PROVIDER",
    description:
      "Provides scheduler, tools, delegation, and profile operations context.",
    contexts: ["automation", "settings", "admin"],
    contextGate: { anyOf: ["automation", "settings", "admin"] },
    cacheStable: false,
    cacheScope: "turn",
    get: async (): Promise<ProviderResult> => operationsContextResult(services),
  };

  return [coreProvider, workspaceProvider, operationsProvider];
}
