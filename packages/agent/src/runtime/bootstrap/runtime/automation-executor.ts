import type { AgentRuntime } from "@elizaos/core";
import type { GatewayRunner } from "@/gateway/runner";
import { getEffectiveSkills } from "@/runtime/native/service-bridge/autonomous";
import type { AppServices } from "@/services";
import type { AutomationExecutionContext } from "@/services/automation/types";
import type { AutomationJobRecord } from "@/types";
import type { EnvConfig } from "@/types/runtime";

export function buildAutomationPrompt(
  runtime: AgentRuntime,
  services: AppServices,
  prompt: string,
  skillSlugs: string[],
  context: AutomationExecutionContext,
): string {
  const payloadContext = context.payload
    ? `\n\nTrigger payload:\n${JSON.stringify(context.payload, null, 2).slice(0, 12_000)}`
    : "";
  if (!skillSlugs.length) {
    return `${prompt}${payloadContext}`;
  }

  const skillsBySlug = new Map(
    getEffectiveSkills(runtime, services).map((skill) => [skill.slug, skill]),
  );
  const loadedSkills = skillSlugs
    .map((slug) => skillsBySlug.get(slug))
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));

  if (!loadedSkills.length) {
    return `${prompt}${payloadContext}`;
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
    `${prompt}${payloadContext}`,
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

export function createAutomationExecutor(params: {
  config: EnvConfig;
  services: AppServices;
  runtime: AgentRuntime;
  ensureGateway(): GatewayRunner;
}) {
  const { config, services, runtime, ensureGateway } = params;

  return async (
    job: AutomationJobRecord,
    executionContext: AutomationExecutionContext,
  ): Promise<string> => {
    if (job.action?.type === "webhook") {
      const response = await fetch(job.action.url, {
        method: job.action.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          automation: { id: job.id, name: job.name },
          trigger: executionContext.source,
          payload: executionContext.payload ?? {},
          sentAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const responseBody = (await response.text()).slice(0, 20_000);
      if (!response.ok) {
        throw new Error(
          `Webhook returned ${response.status}${responseBody ? `: ${responseBody}` : ""}`,
        );
      }
      return responseBody || `Webhook accepted with ${response.status}.`;
    }

    const { handleAgentTurn } = await import("@/runtime/chat");
    const output = await handleAgentTurn(
      {
        message: buildAutomationPrompt(
          runtime,
          services,
          job.action?.type === "run-agent" || job.action?.type === "prompt"
            ? job.action.prompt
            : job.prompt,
          job.skills,
          executionContext,
        ),
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
