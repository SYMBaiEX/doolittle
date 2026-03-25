import { arch, hostname, platform, release } from "node:os";
import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { resolveAgentContextScope } from "@/runtime/turn-classification";
import type { AppServices } from "@/services";

function formatDelegationOverview(
  overview: ReturnType<AppServices["delegation"]["overview"]>,
): string {
  return [
    `total=${overview.total} pending=${overview.pending} running=${overview.running} completed=${overview.completed} failed=${overview.failed} cancelled=${overview.cancelled}`,
    `workers active=${overview.activeWorkers} alive=${overview.aliveWorkers} stalled=${overview.stalledWorkers} concurrency=${overview.concurrency}`,
    overview.byProfile.length
      ? `profiles=${overview.byProfile
          .slice(0, 4)
          .map((entry) => `${entry.profile}:${entry.count}`)
          .join(", ")}`
      : undefined,
    overview.byPriority.length
      ? `priority=${overview.byPriority
          .slice(0, 4)
          .map((entry) => `${entry.priority}:${entry.count}`)
          .join(", ")}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export function createAgentContextProvider(services: AppServices): Provider {
  const sessionScopedCache = new Map<
    string,
    Map<
      "minimal" | "local" | "full",
      {
        capturedAt: number;
        text: string;
        data: {
          scope: "minimal" | "local" | "full";
          skillsCount: number;
          cronJobs: number;
          personality: string;
          terminalCommands: number;
        };
      }
    >
  >();
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
      message: Memory,
      _state?: State,
    ): Promise<ProviderResult> => {
      const messageText =
        typeof message.content?.text === "string" ? message.content.text : "";
      const scope = resolveAgentContextScope(messageText);
      const roomKey = String(message.roomId ?? "global");
      const now = Date.now();
      const cacheTtlMs =
        scope === "minimal"
          ? Number.POSITIVE_INFINITY
          : scope === "local"
            ? 30_000
            : 20_000;
      const sessionCache =
        sessionScopedCache.get(roomKey) ??
        (() => {
          const next = new Map();
          sessionScopedCache.set(roomKey, next);
          return next;
        })();
      const cached = sessionCache.get(scope);
      if (cached && now - cached.capturedAt < cacheTtlMs) {
        return {
          text: cached.text,
          values: {},
          data: cached.data,
        };
      }

      const personality = services.personalities.getActive();
      const settings = services.settings.get();
      const skillEntries = services.skills.list();
      const compactMemory = (target: "memory" | "user"): string => {
        const summary = services.memory.summary(target);
        const label = target === "memory" ? "MEMORY" : "USER PROFILE";
        if (!summary.preview.length) {
          return `${label}\n(empty)`;
        }
        return [
          `${label} (${summary.entries} entries, ${summary.characters} chars)`,
          ...summary.preview.slice(-3).map((entry) => `- ${entry}`),
        ].join("\n");
      };
      const contextFiles =
        scope === "minimal" ? "" : services.contextFiles.render();
      const cronJobs = scope === "full" ? services.cron.list() : [];
      const recentTerminal = services.terminal.recent(
        scope === "minimal" ? 2 : 5,
      );
      const enabledTools = scope === "full" ? services.tools.enabled() : [];
      const delegationTasks =
        scope === "full" ? services.delegation.list() : [];
      const delegationOverview =
        scope === "full" ? services.delegation.overview() : undefined;
      const delegationWorkers =
        scope === "full" ? services.delegation.workers(5) : [];
      const userProfileEntries =
        scope === "full" ? services.userProfiles.list() : [];
      const skills = skillEntries
        .slice(0, scope === "full" ? 10 : scope === "local" ? 6 : 3)
        .map((skill) => {
          const source = skill.source ?? "workspace";
          const commandHint = skill.commandName
            ? ` cmd=${skill.commandName}`
            : "";
          return `- ${skill.slug} [${source}${commandHint}]: ${skill.description}`;
        })
        .join("\n");
      const cronSummary = cronJobs
        .slice(0, 5)
        .map(
          (job) =>
            `- ${job.name} [${job.status}] next=${job.nextRunAt ?? "n/a"}`,
        )
        .join("\n");
      const workspaceSummary =
        scope === "minimal"
          ? ""
          : services.workspace.summary(scope === "full" ? 16 : 8);
      const recentCommands =
        scope === "minimal"
          ? ""
          : recentTerminal
              .map((entry) => `- [${entry.exitCode}] ${entry.command}`)
              .join("\n");
      const needsRepoSummary = scope !== "minimal";
      const repoSummary = needsRepoSummary
        ? repoCache && now - repoCache.capturedAt < 30_000
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
              )
        : "";
      const toolsSummary = enabledTools
        .slice(0, 6)
        .map((tool) => `- ${tool.id}: ${tool.description}`)
        .join("\n");
      const delegationSummary = delegationTasks
        .slice(0, 4)
        .map((task) => `- ${task.title} [${task.status}]`)
        .join("\n");
      const delegationWorkersSummary = delegationWorkers
        .map(
          (worker) =>
            `- ${worker.title} [${worker.status}] alive=${worker.alive} stalled=${worker.stalled} attempts=${worker.attempts}/${worker.maxAttempts}`,
        )
        .join("\n");
      const userProfiles = userProfileEntries
        .slice(0, 4)
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

      const sections: string[] = [
        compactMemory("memory"),
        "",
        compactMemory("user"),
        "",
        "ACTIVE PERSONALITY",
        `${personality.name}: ${personality.description}`,
        personality.systemAddendum,
        "",
        "HOST ENVIRONMENT",
        hostEnvironment,
      ];

      if (scope !== "minimal") {
        sections.push(
          "",
          "WORKSPACE CONTEXT",
          contextFiles || "(none)",
          "",
          "AVAILABLE SKILLS",
          skills || "(none)",
          "",
          "WORKSPACE TREE",
          workspaceSummary || "(none)",
          "",
          "RECENT TERMINAL COMMANDS",
          recentCommands || "(none)",
          "",
          "REPOSITORY STATUS",
          repoSummary || "(none)",
        );
      } else {
        sections.push("", "AVAILABLE SKILLS", skills || "(none)");
      }

      if (scope === "full") {
        sections.push(
          "",
          "CRON JOBS",
          cronSummary || "(none)",
          "",
          "TOOLS",
          toolsSummary || "(none)",
          "",
          "DELEGATION TASKS",
          delegationSummary || "(none)",
          "",
          "DELEGATION OVERVIEW",
          delegationOverview
            ? formatDelegationOverview(delegationOverview)
            : "(none)",
          "",
          "DELEGATION WORKERS",
          delegationWorkersSummary || "(none)",
          "",
          "USER PROFILES",
          userProfiles || "(none)",
        );
      }

      const text = sections.join("\n");

      const data = {
        scope,
        skillsCount: skillEntries.length,
        cronJobs: cronJobs.length,
        personality: personality.id,
        terminalCommands: recentTerminal.length,
      };

      const nextCacheEntry = {
        capturedAt: Date.now(),
        text,
        data,
      };
      if (scope === "minimal" || scope === "local") {
        sessionCache.set(scope, nextCacheEntry);
      } else {
        sessionCache.set(scope, nextCacheEntry);
      }

      return {
        text,
        values: {},
        data,
      };
    },
  };
}
