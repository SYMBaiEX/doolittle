import type { IAgentRuntime } from "@elizaos/core";
import type { GatewayRunner } from "@/gateway/runner";
import { applyRuntimeOverrides } from "@/runtime/chat-turn/overrides";
import { getEffectiveSkills } from "@/runtime/native/service-bridge/autonomous";
import {
  buildCacheablePrompt,
  hashParts,
  promptCacheMetrics,
} from "@/runtime/prompt-cache";
import type { AppServices } from "@/services";
import type { AutomationExecutionContext } from "@/services/automation/types";
import type { AutomationJobRecord } from "@/types";
import type { EnvConfig } from "@/types/runtime";

export function buildAutomationPrompt(
  runtime: IAgentRuntime,
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

function automationIdentity(job: AutomationJobRecord): {
  userId: string;
  roomId: string;
} {
  // These names intentionally describe the durable Eliza automation entity,
  // rather than pretending that every scheduled run is the same "cron" user.
  return {
    userId: `automation:${job.id}`,
    roomId: `automation:${job.id}`,
  };
}

function buildCacheableAutomationPrompt(input: {
  runtime: IAgentRuntime;
  services: AppServices;
  job: AutomationJobRecord;
  context: AutomationExecutionContext;
}): string {
  const task =
    input.job.action?.type === "run-agent" ||
    input.job.action?.type === "prompt"
      ? input.job.action.prompt
      : input.job.prompt;
  const prompt = buildAutomationPrompt(
    input.runtime,
    input.services,
    task,
    input.job.skills,
    input.context,
  );
  const settings = applyRuntimeOverrides(
    input.services.settings.get(),
    input.job.runtime,
  );
  const cacheable = buildCacheablePrompt({
    // The native message executor owns the actual model invocation. Building
    // this message through the same cache contract preserves stable leading
    // automation/skill instructions and records provider cache eligibility.
    stableBlocks: [
      "Doolittle automation execution. Follow the selected skills and return a concrete completion report.",
      `automationId=${input.job.id}\nautomationName=${input.job.name}\naction=${input.job.action?.type ?? "prompt"}`,
    ],
    volatile: prompt,
    provider: settings.model.provider,
    model: settings.model.model,
    versionDigest: hashParts([
      "doolittle-automation-turn-v2",
      input.job.id,
      input.job.name,
      ...input.job.skills,
    ]),
    conversationId: `automation:${input.job.id}`,
  });
  promptCacheMetrics.recordPlan(cacheable.stats);
  return cacheable.prompt;
}

async function notifyProgress(
  context: AutomationExecutionContext,
  phase: "action" | "delivery",
  status: "started" | "completed" | "failed" | "cancelled",
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await context.onProgress?.({ phase, status, message, metadata });
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
  runtime: IAgentRuntime;
  ensureGateway(): GatewayRunner;
}) {
  const { config, services, runtime, ensureGateway } = params;

  return async (
    job: AutomationJobRecord,
    executionContext: AutomationExecutionContext,
  ): Promise<string> => {
    if (executionContext.abortSignal?.aborted) {
      await notifyProgress(
        executionContext,
        "action",
        "cancelled",
        "Automation execution was cancelled before it started.",
      );
      throw new DOMException(
        "Automation execution was cancelled.",
        "AbortError",
      );
    }
    if (job.action?.type === "webhook") {
      await notifyProgress(
        executionContext,
        "action",
        "started",
        "Sending webhook.",
      );
      let response: Response;
      try {
        response = await fetch(job.action.url, {
          method: job.action.method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            automation: { id: job.id, name: job.name },
            trigger: executionContext.source,
            payload: executionContext.payload ?? {},
            sentAt: new Date().toISOString(),
          }),
          signal: executionContext.abortSignal ?? AbortSignal.timeout(30_000),
        });
      } catch (error) {
        const cancelled = executionContext.abortSignal?.aborted === true;
        await notifyProgress(
          executionContext,
          "action",
          cancelled ? "cancelled" : "failed",
          cancelled
            ? "Webhook delivery was cancelled."
            : "Webhook delivery failed.",
        );
        throw error;
      }
      const responseBody = (await response.text()).slice(0, 20_000);
      if (!response.ok) {
        await notifyProgress(
          executionContext,
          "action",
          "failed",
          `Webhook returned ${response.status}.`,
          { status: response.status },
        );
        throw new Error(
          `Webhook returned ${response.status}${responseBody ? `: ${responseBody}` : ""}`,
        );
      }
      await notifyProgress(
        executionContext,
        "action",
        "completed",
        "Webhook accepted.",
        {
          status: response.status,
        },
      );
      return responseBody || `Webhook accepted with ${response.status}.`;
    }

    const { handleAgentTurn } = await import("@/runtime/chat");
    const identity = automationIdentity(job);
    const executionId = executionContext.executionId ?? crypto.randomUUID();
    await notifyProgress(
      executionContext,
      "action",
      "started",
      "Running native Eliza automation turn.",
      {
        executionId,
        provider: job.runtime?.provider,
        model: job.runtime?.model,
        personalityId: job.runtime?.personalityId,
        skills: job.skills,
      },
    );
    const output = await handleAgentTurn(
      {
        message: buildCacheableAutomationPrompt({
          runtime,
          services,
          job,
          context: executionContext,
        }),
        userId: identity.userId,
        roomId: identity.roomId,
        runId: executionId,
        source: "automation",
      },
      {
        config,
        services,
        runtime,
      },
      {
        runtimeOverrides: job.runtime,
        personalityId: job.runtime?.personalityId,
        abortSignal: executionContext.abortSignal,
        onNotice: async (notice) => {
          await notifyProgress(
            executionContext,
            "action",
            "started",
            notice.message,
            { kind: notice.kind },
          );
        },
      },
    );
    await notifyProgress(
      executionContext,
      "action",
      "completed",
      "Native Eliza automation turn completed.",
      {
        executionId,
      },
    );

    if (job.delivery === "home") {
      await notifyProgress(
        executionContext,
        "delivery",
        "started",
        "Delivering to home channels.",
      );
      const deliveries = await ensureGateway().sendToHomes(output, {
        metadata: {
          cronJobId: job.id,
          cronJobName: job.name,
        },
        name: job.name,
      });
      await notifyProgress(
        executionContext,
        "delivery",
        "completed",
        `Delivered to ${deliveries.length} home channel${deliveries.length === 1 ? "" : "s"}.`,
        { count: deliveries.length },
      );
      return `${output}${formatCronDeliverySummary(deliveries.length, job.delivery)}`;
    }

    await notifyProgress(
      executionContext,
      "delivery",
      "completed",
      "Local automation result persisted.",
    );
    return output;
  };
}
