import type { Memory, Provider, ProviderResult, State } from "@elizaos/core";
import type { IAgentRuntime } from "@elizaos/core";
import type { AppServices } from "@/services";

export function createAgentContextProvider(services: AppServices): Provider {
  return {
    name: "ELIZA_AGENT_CONTEXT_PROVIDER",
    description: "Injects memory, skills, and scheduler context into the runtime.",
    get: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      _state?: State,
    ): Promise<ProviderResult> => {
      const memorySnapshot = services.memory.renderSnapshot("memory");
      const userSnapshot = services.memory.renderSnapshot("user");
      const personality = services.personalities.getActive();
      const contextFiles = services.contextFiles.render();
      const skills = services.skills
        .list()
        .slice(0, 12)
        .map((skill) => `- ${skill.slug}: ${skill.description}`)
        .join("\n");
      const cronSummary = services.cron
        .list()
        .slice(0, 8)
        .map((job) => `- ${job.name} [${job.status}] next=${job.nextRunAt ?? "n/a"}`)
        .join("\n");
      const workspaceSummary = services.workspace.summary(18);
      const recentCommands = services.terminal
        .recent(5)
        .map((entry) => `- [${entry.exitCode}] ${entry.command}`)
        .join("\n");
      const repoSummary = await services.repository.status().catch(
        (error) => `Repository status unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      const toolsSummary = services.tools
        .enabled()
        .slice(0, 10)
        .map((tool) => `- ${tool.id}: ${tool.description}`)
        .join("\n");
      const delegationSummary = services.delegation
        .list()
        .slice(0, 5)
        .map((task) => `- ${task.title} [${task.status}]`)
        .join("\n");

      const text = [
        memorySnapshot,
        "",
        userSnapshot,
        "",
        "ACTIVE PERSONALITY",
        `${personality.name}: ${personality.description}`,
        personality.systemAddendum,
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
      ].join("\n");

      return {
        text,
        values: {},
        data: {
          skillsCount: services.skills.list().length,
          cronJobs: services.cron.list().length,
          personality: personality.id,
          terminalCommands: services.terminal.recent(5).length,
        },
      };
    },
  };
}
