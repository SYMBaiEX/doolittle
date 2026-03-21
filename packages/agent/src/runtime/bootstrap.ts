import { AgentRuntime } from "@elizaos/core";
import character from "@/character";
import { loadConfig } from "@/config/env";
import { featureMap } from "@/config/feature-map";
import { GatewayRunner } from "@/gateway/gateway-runner";
import { describeAutonomousAlignment } from "@/runtime/native/autonomous-stack";
import { buildNativePluginAssembly } from "@/runtime/native/plugin-registry";
import { type AppServices, createServices } from "@/services";
import { DocumentsService } from "@/services/documents-service";
import type { EnvConfig } from "@/types";

export interface AppContext {
  config: EnvConfig;
  services: AppServices;
  runtime: AgentRuntime;
  gateway: GatewayRunner;
}

let contextPromise: Promise<AppContext> | undefined;

function buildPluginSettings(
  config: EnvConfig,
  services: AppServices,
  runtimeSettings: AppServices["settings"]["get"] extends () => infer T
    ? T
    : never,
) {
  const settings: Record<string, string> = {
    featureMap: JSON.stringify(featureMap),
    runtimeSettings: JSON.stringify(runtimeSettings),
    nativeServiceRegistry: JSON.stringify(services.nativeRegistry),
    autonomousAlignment: JSON.stringify(describeAutonomousAlignment()),
    OPENAI_BASE_URL: config.openAiBaseUrl,
    OPENAI_SMALL_MODEL: runtimeSettings.model.model,
    OPENAI_LARGE_MODEL: runtimeSettings.model.model,
    ANTHROPIC_SMALL_MODEL: config.anthropicSmallModel,
    ANTHROPIC_LARGE_MODEL: config.anthropicLargeModel,
  };

  if (config.openAiApiKey) {
    settings.OPENAI_API_KEY = config.openAiApiKey;
  }

  if (config.anthropicApiKey) {
    settings.ANTHROPIC_API_KEY = config.anthropicApiKey;
  }

  if (config.anthropicBaseUrl) {
    settings.ANTHROPIC_BASE_URL = config.anthropicBaseUrl;
  }

  if (config.telegramBotToken) {
    settings.TELEGRAM_BOT_TOKEN = config.telegramBotToken;
  }

  if (config.telegramApiRoot) {
    settings.TELEGRAM_API_ROOT = config.telegramApiRoot;
  }

  if (config.telegramAllowedChats) {
    settings.TELEGRAM_ALLOWED_CHATS = config.telegramAllowedChats;
  }

  return settings;
}

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
    "Use the following installed Eliza Agent skills as execution guidance when relevant.",
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

export async function getAppContext(): Promise<AppContext> {
  if (contextPromise) {
    return contextPromise;
  }

  contextPromise = (async () => {
    const config = loadConfig();
    const services = createServices(config);
    const runtimeSettings = services.settings.get();
    const nativePluginAssembly = buildNativePluginAssembly(services, config);
    const runtime = new AgentRuntime({
      character: {
        ...character,
        name: config.agentName,
        settings: {
          ...(character.settings ?? {}),
          ...buildPluginSettings(config, services, runtimeSettings),
          nativePluginCatalog: JSON.stringify(nativePluginAssembly.catalog),
        },
      },
      plugins: nativePluginAssembly.all,
    });

    await runtime.initialize();
    services.diagnostics.attachRuntime(runtime);
    services.operator.attachRuntime(runtime);
    services.documents = new DocumentsService(runtime, config.workspaceDir);
    const gatewayService = runtime.getService("eliza_agent_gateway") as {
      runner?: GatewayRunner;
    } | null;
    let gateway = gatewayService?.runner;
    if (!gateway) {
      const gatewayContext = {
        config,
        services,
        runtime,
      } as AppContext;
      gateway = new GatewayRunner(gatewayContext);
      gatewayContext.gateway = gateway;
    }

    services.cron.setExecutor(async (job) => {
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
        const deliveries = await gateway.sendToHomes(output, {
          metadata: {
            cronJobId: job.id,
            cronJobName: job.name,
          },
          name: job.name,
        });
        return `${output}${formatCronDeliverySummary(deliveries.length, job.delivery)}`;
      }
      return output;
    });
    services.cron.start();

    return {
      config,
      services,
      runtime,
      gateway,
    };
  })();

  return contextPromise;
}
