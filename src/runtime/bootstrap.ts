import { AgentRuntime } from "@elizaos/core";
import anthropicPlugin from "@elizaos/plugin-anthropic";
import { openaiPlugin } from "@elizaos/plugin-openai";
import { pdfPlugin } from "@elizaos/plugin-pdf";
import sqlPlugin from "@elizaos/plugin-sql";
import telegramPlugin from "@elizaos/plugin-telegram";
import character from "@/character";
import { loadConfig } from "@/config/env";
import { featureMap } from "@/config/feature-map";
import { GatewayRunner } from "@/gateway/gateway-runner";
import { createElizaAgentPlugin } from "@/plugins/eliza-agent-plugin";
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
  runtimeSettings: AppServices["settings"]["get"] extends () => infer T
    ? T
    : never,
) {
  const settings: Record<string, string> = {
    featureMap: JSON.stringify(featureMap),
    runtimeSettings: JSON.stringify(runtimeSettings),
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

function buildRuntimePlugins(services: AppServices, config: EnvConfig) {
  const plugins = [sqlPlugin, pdfPlugin];

  if (config.openAiApiKey) {
    plugins.push(openaiPlugin);
  }

  if (config.anthropicApiKey) {
    plugins.push(anthropicPlugin);
  }

  if (config.telegramBotToken) {
    plugins.push(telegramPlugin);
  }

  plugins.push(createElizaAgentPlugin(services, config));

  return plugins;
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

export async function getAppContext(): Promise<AppContext> {
  if (contextPromise) {
    return contextPromise;
  }

  contextPromise = (async () => {
    const config = loadConfig();
    const services = createServices(config);
    const runtimeSettings = services.settings.get();
    const runtime = new AgentRuntime({
      character: {
        ...character,
        name: config.agentName,
        settings: {
          ...(character.settings ?? {}),
          ...buildPluginSettings(config, runtimeSettings),
        },
      },
      plugins: buildRuntimePlugins(services, config),
    });

    await runtime.initialize();
    services.cron.setExecutor(async (job) => {
      const { handleAgentTurn } = await import("@/runtime/chat");
      return handleAgentTurn(
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
    });
    services.cron.start();
    services.documents = new DocumentsService(runtime, config.workspaceDir);
    const gatewayService = runtime.getService("eliza_agent_gateway") as {
      runner?: GatewayRunner;
    } | null;
    let gateway = gatewayService?.runner;
    if (!gateway) {
      const gatewayContext = {} as AppContext;
      gateway = new GatewayRunner(gatewayContext);
      gatewayContext.config = config;
      gatewayContext.services = services;
      gatewayContext.runtime = runtime;
      gatewayContext.gateway = gateway;
    }

    return {
      config,
      services,
      runtime,
      gateway,
    };
  })();

  return contextPromise;
}
