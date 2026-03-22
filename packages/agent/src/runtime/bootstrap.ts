import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentRuntime } from "@elizaos/core";
import character from "@/character";
import { loadConfig } from "@/config/env";
import { featureMap } from "@/config/feature-map";
import { GatewayRunner } from "@/gateway/gateway-runner";
import {
  getLinkedClaudeCodeCredentials,
  getLinkedCodexCredentials,
} from "@/runtime/native/account-auth";
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

function ensureSecretSalt(config: EnvConfig): string {
  const provided =
    process.env.SECRET_SALT?.trim() || process.env.ELIZA_SECRET_SALT?.trim();
  if (provided) {
    return provided;
  }

  const saltPath = join(config.dataDir, "secret-salt");
  try {
    const existing = readFileSync(saltPath, "utf8").trim();
    if (existing) {
      return existing;
    }
  } catch {
    // Fall through and create a stable per-workspace salt.
  }

  const generated = randomUUID().replace(/-/g, "");
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(saltPath, `${generated}\n`, "utf8");
  return generated;
}

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
    SECRET_SALT: ensureSecretSalt(config),
    PGLITE_DATA_DIR: join(config.dataDir, "pglite"),
  };

  const modelProvider = runtimeSettings.model.provider;
  const linkedCodex =
    config.useLinkedCodexAuth && modelProvider === "codex"
      ? getLinkedCodexCredentials()
      : undefined;
  const linkedClaudeCode =
    config.useLinkedClaudeCodeAuth && modelProvider === "claude-code"
      ? getLinkedClaudeCodeCredentials()
      : undefined;

  if (linkedCodex?.accessToken) {
    settings.OPENAI_API_KEY = linkedCodex.accessToken;
    settings.OPENAI_BASE_URL = "https://chatgpt.com/backend-api/codex";
  } else if (config.openAiApiKey) {
    settings.OPENAI_API_KEY = config.openAiApiKey;
  }

  if (linkedClaudeCode?.accessToken) {
    settings.ANTHROPIC_API_KEY = linkedClaudeCode.accessToken;
  } else if (config.anthropicApiKey) {
    settings.ANTHROPIC_API_KEY = config.anthropicApiKey;
  }

  if (config.anthropicBaseUrl) {
    settings.ANTHROPIC_BASE_URL = config.anthropicBaseUrl;
  }

  if (config.falApiKey) {
    settings.FAL_API_KEY = config.falApiKey;
  }

  settings.E2B_MODE = process.env.E2B_MODE ?? "local";
  settings.NODE_ENV = process.env.NODE_ENV ?? "development";

  if (process.env.E2B_API_KEY) {
    settings.E2B_API_KEY = process.env.E2B_API_KEY;
  }

  if (process.env.GITHUB_TOKEN) {
    settings.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
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
    process.env.SECRET_SALT =
      process.env.SECRET_SALT || ensureSecretSalt(config);
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
    services.nativeOwnership.attachRuntime(runtime, services);
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
