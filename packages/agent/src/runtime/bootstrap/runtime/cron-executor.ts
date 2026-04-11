import type { AgentRuntime } from "@elizaos/core";
import type { GatewayRunner } from "@/gateway/runner";
import type { AppServices } from "@/services";
import type { CronJobRecord } from "@/types";
import type { EnvConfig } from "@/types/runtime";

function buildCronPrompt(
  services: AppServices,
  prompt: string,
  skillSlugs: string[],
): string {
  if (!skillSlugs.length) {
    return prompt;
  }

  const loadedSkills = skillSlugs
    .map((slug) => services.skills.get(slug))
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));

  if (!loadedSkills.length) {
    return prompt;
  }

  const skillContext = loadedSkills
    .map(
      (skill) =>
        `## Skill: ${skill.title}\nslug=${skill.slug}\npath=${skill.path}\n\n${skill.content.trim()}`,
    )
    .join("\n\n");

  return [
    "Use the following installed Doolittle skills as execution guidance when relevant.",
    skillContext,
    "Task:",
    prompt,
  ].join("\n\n");
}

function formatCronDeliverySummary(
  count: number,
  delivery: "origin" | "local" | "home",
): string {
  if (delivery !== "home") {
    return "";
  }
  return count > 0
    ? `\n\nDelivered to ${count} home channel${count === 1 ? "" : "s"}.`
    : "\n\nNo home channels are configured yet for delivery.";
}

export function createCronExecutor(params: {
  config: EnvConfig;
  services: AppServices;
  runtime: AgentRuntime;
  ensureGateway(): GatewayRunner;
}) {
  const { config, services, runtime, ensureGateway } = params;

  return async (job: CronJobRecord): Promise<string> => {
    const { handleAgentTurn } = await import("@/runtime/chat");
    const output = await handleAgentTurn(
      {
        message: buildCronPrompt(services, job.prompt, job.skills),
        userId: "cron",
        roomId: `cron:${job.id}`,
        source: "cron",
      },
      {
        config,
        services,
        runtime,
      },
      {
        runtimeOverrides: job.runtime,
        personalityId: job.runtime?.personalityId,
      },
    );

    if (job.delivery === "home") {
      const deliveries = await ensureGateway().sendToHomes(output, {
        metadata: {
          cronJobId: job.id,
          cronJobName: job.name,
        },
        name: job.name,
      });
      return `${output}${formatCronDeliverySummary(deliveries.length, job.delivery)}`;
    }

    return output;
  };
}
