import { featureMap } from "@/config/feature-map";
import { getPgliteDataDir } from "@/runtime/bootstrap/env/pglite";
import { ensureSecretSalt } from "@/runtime/bootstrap/env/secret-salt";
import {
  getLinkedClaudeCodeCredentials,
  getLinkedCodexCredentials,
  getLinkedElizaCloudCredentials,
} from "@/runtime/native/account-auth/index";
import { describeAutonomousAlignment } from "@/runtime/native/autonomous-stack";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";

type RuntimeSettings = ReturnType<AppServices["settings"]["get"]>;

export interface PluginSettings {
  featureMap: string;
  runtimeSettings: string;
  nativeServiceRegistry: string;
  autonomousAlignment: string;
  ELIZAOS_CLOUD_BASE_URL: string;
  ELIZAOS_CLOUD_SMALL_MODEL: string;
  ELIZAOS_CLOUD_LARGE_MODEL: string;
  ELIZAOS_CLOUD_EMBEDDING_MODEL: string;
  ELIZAOS_CLOUD_ENABLED: string;
  DOOLITTLE_EMBEDDING_PROVIDER: string;
  OPENAI_BASE_URL: string;
  OPENAI_SMALL_MODEL: string;
  OPENAI_LARGE_MODEL: string;
  ANTHROPIC_SMALL_MODEL: string;
  ANTHROPIC_LARGE_MODEL: string;
  SECRET_SALT: string;
  PGLITE_DATA_DIR: string;
  USE_MULTI_STEP: string;
  MAX_MULTISTEP_ITERATIONS: string;
  DOOLITTLE_RUN_DEPTH: string;
  DOOLITTLE_TOOL_PROGRESS: string;
  E2B_MODE: string;
  NODE_ENV: string;
  ELIZAOS_CLOUD_API_KEY?: string;
  ELIZAOS_CLOUD_EMBEDDING_URL?: string;
  ELIZAOS_CLOUD_EMBEDDING_API_KEY?: string;
  ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  FAL_API_KEY?: string;
  E2B_API_KEY?: string;
  GITHUB_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_API_ROOT?: string;
  TELEGRAM_ALLOWED_CHATS?: string;
}

interface BuildPluginSettingsDependencies {
  env?: NodeJS.ProcessEnv;
  secretSalt?: string;
  pgliteDataDir?: string;
  linkedCredentials?: {
    codex?: ReturnType<typeof getLinkedCodexCredentials>;
    elizaCloud?: ReturnType<typeof getLinkedElizaCloudCredentials>;
    claudeCode?: ReturnType<typeof getLinkedClaudeCodeCredentials>;
  };
}

function shouldUseCloudEmbeddings(
  config: EnvConfig,
  env: NodeJS.ProcessEnv,
): boolean {
  return (
    Boolean(config.elizaCloudEmbeddingUrl?.trim()) ||
    Boolean(config.elizaCloudEmbeddingApiKey?.trim()) ||
    Boolean(config.elizaCloudEmbeddingDimensions) ||
    env.DOOLITTLE_EMBEDDING_PROVIDER?.trim().toLowerCase() === "elizacloud"
  );
}

function buildBaseSettings(
  config: EnvConfig,
  services: AppServices,
  runtimeSettings: RuntimeSettings,
  env: NodeJS.ProcessEnv,
  dependencies: BuildPluginSettingsDependencies,
): PluginSettings {
  const useCloudEmbeddings = shouldUseCloudEmbeddings(config, env);
  return {
    featureMap: JSON.stringify(featureMap),
    runtimeSettings: JSON.stringify(runtimeSettings),
    nativeServiceRegistry: JSON.stringify(services.nativeRegistry),
    autonomousAlignment: JSON.stringify(describeAutonomousAlignment(config)),
    ELIZAOS_CLOUD_BASE_URL: config.elizaCloudBaseUrl,
    ELIZAOS_CLOUD_SMALL_MODEL: config.elizaCloudSmallModel,
    ELIZAOS_CLOUD_LARGE_MODEL: config.elizaCloudLargeModel,
    ELIZAOS_CLOUD_EMBEDDING_MODEL: config.elizaCloudEmbeddingModel,
    ELIZAOS_CLOUD_ENABLED: String(
      config.elizaCloudEnabled ||
        runtimeSettings.model.provider === "elizacloud",
    ),
    DOOLITTLE_EMBEDDING_PROVIDER: useCloudEmbeddings ? "elizacloud" : "local",
    OPENAI_BASE_URL: config.openAiBaseUrl,
    OPENAI_SMALL_MODEL: runtimeSettings.model.model,
    OPENAI_LARGE_MODEL: runtimeSettings.model.model,
    ANTHROPIC_SMALL_MODEL: config.anthropicSmallModel,
    ANTHROPIC_LARGE_MODEL: config.anthropicLargeModel,
    SECRET_SALT:
      dependencies.secretSalt ??
      env.SECRET_SALT?.trim() ??
      ensureSecretSalt(config),
    PGLITE_DATA_DIR:
      dependencies.pgliteDataDir ?? getPgliteDataDir(config, env),
    USE_MULTI_STEP: "true",
    MAX_MULTISTEP_ITERATIONS: String(runtimeSettings.agent.maxIterations),
    DOOLITTLE_RUN_DEPTH: runtimeSettings.agent.runDepth,
    DOOLITTLE_TOOL_PROGRESS: runtimeSettings.agent.toolProgressMode,
    E2B_MODE: env.E2B_MODE ?? "local",
    NODE_ENV: env.NODE_ENV ?? "development",
  };
}

function applyLinkedProviderSettings(
  settings: PluginSettings,
  config: EnvConfig,
  runtimeSettings: RuntimeSettings,
  dependencies: BuildPluginSettingsDependencies,
): void {
  const modelProvider = runtimeSettings.model.provider;
  const linkedCodex =
    dependencies.linkedCredentials?.codex ??
    (config.useLinkedCodexAuth && modelProvider === "codex"
      ? getLinkedCodexCredentials()
      : undefined);
  const linkedElizaCloud =
    dependencies.linkedCredentials?.elizaCloud ??
    (modelProvider === "elizacloud"
      ? getLinkedElizaCloudCredentials()
      : undefined);
  const linkedClaudeCode =
    dependencies.linkedCredentials?.claudeCode ??
    (config.useLinkedClaudeCodeAuth && modelProvider === "claude-code"
      ? getLinkedClaudeCodeCredentials()
      : undefined);

  if (linkedElizaCloud?.apiKey) {
    settings.ELIZAOS_CLOUD_API_KEY = linkedElizaCloud.apiKey;
    settings.ELIZAOS_CLOUD_ENABLED = "true";
    settings.ELIZAOS_CLOUD_BASE_URL =
      linkedElizaCloud.baseUrl || config.elizaCloudBaseUrl;
  } else if (config.elizaCloudApiKey) {
    settings.ELIZAOS_CLOUD_API_KEY = config.elizaCloudApiKey;
  }

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
}

function applyEmbeddingSettings(
  settings: PluginSettings,
  config: EnvConfig,
  env: NodeJS.ProcessEnv,
): void {
  if (!shouldUseCloudEmbeddings(config, env)) {
    return;
  }

  if (config.elizaCloudEmbeddingUrl) {
    settings.ELIZAOS_CLOUD_EMBEDDING_URL = config.elizaCloudEmbeddingUrl;
  }
  if (config.elizaCloudEmbeddingApiKey) {
    settings.ELIZAOS_CLOUD_EMBEDDING_API_KEY = config.elizaCloudEmbeddingApiKey;
  }
  if (config.elizaCloudEmbeddingDimensions) {
    settings.ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS = String(
      config.elizaCloudEmbeddingDimensions,
    );
  }
}

function applyOptionalProviderSettings(
  settings: PluginSettings,
  config: EnvConfig,
): void {
  if (config.anthropicBaseUrl) {
    settings.ANTHROPIC_BASE_URL = config.anthropicBaseUrl;
  }

  if (config.falApiKey) {
    settings.FAL_API_KEY = config.falApiKey;
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
}

function applyAmbientProcessSettings(
  settings: PluginSettings,
  env: NodeJS.ProcessEnv,
): void {
  settings.E2B_MODE = env.E2B_MODE ?? "local";
  settings.NODE_ENV = env.NODE_ENV ?? "development";

  if (env.E2B_API_KEY) {
    settings.E2B_API_KEY = env.E2B_API_KEY;
  }

  if (env.GITHUB_TOKEN) {
    settings.GITHUB_TOKEN = env.GITHUB_TOKEN;
  }
}

export function buildPluginSettings(
  config: EnvConfig,
  services: AppServices,
  runtimeSettings: RuntimeSettings,
  dependencies: BuildPluginSettingsDependencies = {},
): PluginSettings {
  const env = dependencies.env ?? process.env;
  const settings = buildBaseSettings(
    config,
    services,
    runtimeSettings,
    env,
    dependencies,
  );
  applyLinkedProviderSettings(settings, config, runtimeSettings, dependencies);
  applyEmbeddingSettings(settings, config, env);
  applyOptionalProviderSettings(settings, config);
  applyAmbientProcessSettings(settings, env);
  return settings;
}
