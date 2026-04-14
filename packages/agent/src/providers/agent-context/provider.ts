import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { resolveAgentContextScope } from "@/runtime/turn-classification/message";
import type { AppServices } from "@/services";
import { AgentContextCache } from "./cache";
import { renderIdentitySections } from "./sections/identity";
import { renderMemorySections } from "./sections/memory";
import { renderOperationSections } from "./sections/operations";
import { renderWorkspaceSections } from "./sections/workspace";
import type { AgentContextData } from "./types";

function buildCoreContextSections(
  services: AppServices,
  scope: "minimal" | "local" | "full",
  repoSummary: string,
): { sections: string[]; data: AgentContextData } {
  const personality = services.personalities.getActive();
  const settings = services.settings.get();
  const memorySummary = services.memory.summary("memory");
  const userSummary = services.memory.summary("user");
  const skillEntries = services.skills.list();
  const contextFiles =
    scope === "minimal" ? "" : services.contextFiles.render();
  const cronJobs = scope === "full" ? services.cron.list() : [];
  const recentTerminal = services.terminal.recent(scope === "minimal" ? 2 : 5);
  const enabledTools = scope === "full" ? services.tools.enabled() : [];
  const delegationTasks = scope === "full" ? services.delegation.list() : [];
  const delegationOverview =
    scope === "full" ? services.delegation.overview() : undefined;
  const delegationWorkers =
    scope === "full" ? services.delegation.workers(5) : [];
  const userProfileEntries =
    scope === "full" ? services.userProfiles.list() : [];
  const workspaceSummary =
    scope === "minimal"
      ? ""
      : services.workspace.summary(scope === "full" ? 16 : 8);

  const sections: string[] = [
    ...renderMemorySections(memorySummary, userSummary),
    "",
    ...renderIdentitySections(personality, settings),
  ];

  sections.push(
    "",
    ...renderWorkspaceSections({
      scope,
      contextFiles,
      skillEntries,
      workspaceSummary,
      recentTerminal,
      repoSummary,
    }),
  );

  if (scope === "full") {
    sections.push(
      "",
      ...renderOperationSections({
        cronJobs,
        enabledTools,
        delegationTasks,
        delegationOverview,
        delegationWorkers,
        userProfileEntries,
      }),
    );
  }

  return {
    sections,
    data: {
      scope,
      skillsCount: skillEntries.length,
      cronJobs: cronJobs.length,
      personality: personality.id,
      terminalCommands: recentTerminal.length,
    },
  };
}

export function createAgentContextProvider(services: AppServices): Provider {
  const cache = new AgentContextCache();

  return {
    name: "DOOLITTLE_CONTEXT_PROVIDER",
    description:
      "Injects memory, skills, and scheduler context into the runtime.",
    get: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state?: State,
    ): Promise<ProviderResult> => {
      const messageText =
        typeof message.content?.text === "string" ? message.content.text : "";
      const scope = resolveAgentContextScope(messageText);
      const roomKey = String(message.roomId ?? "global");
      const turnKey = String(
        message.id ?? `${roomKey}:${message.createdAt ?? Date.now()}`,
      );
      const now = Date.now();

      const frozenTurn = cache.getTurn(turnKey, scope);
      if (frozenTurn) {
        return {
          text: frozenTurn.text,
          values: {},
          data: frozenTurn.data,
        };
      }

      const cached = cache.getSession(roomKey, scope, now);
      if (cached) {
        return {
          text: cached.text,
          values: {},
          data: cached.data,
        };
      }

      const repoSummary =
        scope === "minimal"
          ? ""
          : await cache.resolveRepoSummary(now, () =>
              services.repository.status(),
            );

      const { sections, data } = buildCoreContextSections(
        services,
        scope,
        repoSummary,
      );

      const text = sections.join("\n");
      const nextCacheEntry = {
        capturedAt: Date.now(),
        text,
        data,
      };

      cache.store(roomKey, turnKey, scope, nextCacheEntry);

      return {
        text,
        values: {},
        data,
      };
    },
  };
}
