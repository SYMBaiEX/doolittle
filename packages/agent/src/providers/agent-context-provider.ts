import { arch, hostname, platform, release } from "node:os";
import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import type { AppServices } from "@/services";

export function createAgentContextProvider(services: AppServices): Provider {
  let providerCache:
    | {
        capturedAt: number;
        text: string;
        data: {
          skillsCount: number;
          cronJobs: number;
          personality: string;
          terminalCommands: number;
        };
      }
    | undefined;
  let repoCache:
    | {
        capturedAt: number;
        summary: string;
      }
    | undefined;

  return {
    name: "ELIZA_AGENT_CONTEXT_PROVIDER",
    description:
      "Injects memory, skills, and scheduler context into the runtime.",
    get: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      _state?: State,
    ): Promise<ProviderResult> => {
      const now = Date.now();
      if (providerCache && now - providerCache.capturedAt < 2_000) {
        return {
          text: providerCache.text,
          values: {},
          data: providerCache.data,
        };
      }

      const memorySnapshot = services.memory.renderSnapshot("memory");
      const userSnapshot = services.memory.renderSnapshot("user");
      const personality = services.personalities.getActive();
      const settings = services.settings.get();
      const contextFiles = services.contextFiles.render();
      const skillEntries = services.skills.list();
      const cronJobs = services.cron.list();
      const recentTerminal = services.terminal.recent(5);
      const enabledTools = services.tools.enabled();
      const delegationTasks = services.delegation.list();
      const delegationOverview = services.delegation.overview();
      const delegationWorkers = services.delegation.workers(5);
      const userProfileEntries = services.userProfiles.list();
      const skills = skillEntries
        .slice(0, 12)
        .map((skill) => {
          const source = skill.source ?? "workspace";
          const commandHint = skill.commandName
            ? ` cmd=${skill.commandName}`
            : "";
          return `- ${skill.slug} [${source}${commandHint}]: ${skill.description}`;
        })
        .join("\n");
      const cronSummary = cronJobs
        .slice(0, 8)
        .map(
          (job) =>
            `- ${job.name} [${job.status}] next=${job.nextRunAt ?? "n/a"}`,
        )
        .join("\n");
      const workspaceSummary = services.workspace.summary(18);
      const recentCommands = recentTerminal
        .map((entry) => `- [${entry.exitCode}] ${entry.command}`)
        .join("\n");
      const repoSummary =
        repoCache && now - repoCache.capturedAt < 10_000
          ? repoCache.summary
          : await services.repository
              .status()
              .then((summary) => {
                repoCache = {
                  capturedAt: Date.now(),
                  summary,
                };
                return summary;
              })
              .catch(
                (error) =>
                  `Repository status unavailable: ${error instanceof Error ? error.message : String(error)}`,
              );
      const toolsSummary = enabledTools
        .slice(0, 10)
        .map((tool) => `- ${tool.id}: ${tool.description}`)
        .join("\n");
      const delegationSummary = delegationTasks
        .slice(0, 5)
        .map((task) => `- ${task.title} [${task.status}]`)
        .join("\n");
      const delegationWorkersSummary = delegationWorkers
        .map(
          (worker) =>
            `- ${worker.title} [${worker.status}] alive=${worker.alive} stalled=${worker.stalled} attempts=${worker.attempts}/${worker.maxAttempts}`,
        )
        .join("\n");
      const userProfiles = userProfileEntries
        .slice(0, 5)
        .map(
          (profile) =>
            `- ${profile.displayName ?? profile.userId}: prefs=${profile.preferences.length} facts=${profile.facts.length} notes=${profile.notes.length}`,
        )
        .join("\n");
      const hostEnvironment = [
        `- os=${platform()} ${release()}`,
        `- arch=${arch()}`,
        `- hostname=${hostname()}`,
        `- executionBackend=${settings.execution.backend}`,
        `- modelProvider=${settings.model.provider}`,
        `- model=${settings.model.model}`,
        "- terminal=available via local terminal service and /terminal run",
      ].join("\n");

      const text = [
        memorySnapshot,
        "",
        userSnapshot,
        "",
        "ACTIVE PERSONALITY",
        `${personality.name}: ${personality.description}`,
        personality.systemAddendum,
        "",
        "HOST ENVIRONMENT",
        hostEnvironment,
        "",
        "WORKSPACE CONTEXT",
        contextFiles,
        "",
        "AVAILABLE SKILLS",
        skills || "(none)",
        "",
        "CRON JOBS",
        cronSummary || "(none)",
        "",
        "WORKSPACE TREE",
        workspaceSummary,
        "",
        "RECENT TERMINAL COMMANDS",
        recentCommands || "(none)",
        "",
        "REPOSITORY STATUS",
        repoSummary,
        "",
        "TOOLS",
        toolsSummary || "(none)",
        "",
        "DELEGATION TASKS",
        delegationSummary || "(none)",
        "",
        "DELEGATION OVERVIEW",
        JSON.stringify(delegationOverview, null, 2),
        "",
        "DELEGATION WORKERS",
        delegationWorkersSummary || "(none)",
        "",
        "USER PROFILES",
        userProfiles || "(none)",
      ].join("\n");

      const data = {
        skillsCount: skillEntries.length,
        cronJobs: cronJobs.length,
        personality: personality.id,
        terminalCommands: recentTerminal.length,
      };

      providerCache = {
        capturedAt: Date.now(),
        text,
        data,
      };

      return {
        text,
        values: {},
        data,
      };
    },
  };
}
