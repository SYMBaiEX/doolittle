import type { EnvConfig } from "@/types/runtime";
import { buildAutonomousCompatEnv } from "./compat-env";
import type { AutonomousCompatConfig, AutonomousCompatSnapshot } from "./types";

function resolveExistingOnboardingConnection(config: AutonomousCompatConfig) {
  if (config.cloud?.enabled) {
    return {
      kind: "cloud-managed",
      smallModel: config.models?.small,
      largeModel: config.models?.large,
    } as AutonomousCompatSnapshot["connection"];
  }
  const primaryModel = config.agents.defaults.model?.primary;
  return primaryModel
    ? ({
        kind: "local-provider",
        provider: config.agents.defaults.subscriptionProvider ?? "configured",
        primaryModel,
      } as AutonomousCompatSnapshot["connection"])
    : null;
}

function applySubscriptionProviderConfig(
  config: AutonomousCompatConfig,
  provider: "openai-subscription" | "anthropic-subscription",
) {
  config.agents.defaults = {
    ...config.agents.defaults,
    subscriptionProvider: provider,
    ...(provider === "openai-subscription"
      ? { model: { primary: "openai-codex" } }
      : {}),
  };
}

function resolvePluginAutoEnable(config: AutonomousCompatConfig) {
  const allow = [
    config.connectors.telegram ? "@elizaos/plugin-telegram" : undefined,
    config.connectors.discord ? "@elizaos/plugin-discord" : undefined,
    config.cloud?.enabled ? "@elizaos/plugin-elizacloud" : undefined,
  ].filter((plugin): plugin is string => Boolean(plugin));
  return { allow, changes: [] as unknown[] };
}

function resolveAutonomousPrimaryModel(config: EnvConfig): string | undefined {
  if (config.useLinkedCodexAuth) {
    return config.openAiModel;
  }
  if (config.useLinkedDevinAuth) {
    return config.devinModel;
  }
  if (config.useLinkedClaudeCodeAuth || config.claudeCodeCliFallback) {
    return config.anthropicLargeModel;
  }
  if (config.openAiApiKey) {
    return config.openAiModel;
  }
  if (config.anthropicApiKey) {
    return config.anthropicLargeModel;
  }
  return undefined;
}

export function createAutonomousCompatConfig(
  config: EnvConfig,
): AutonomousCompatConfig {
  const compatConfig: AutonomousCompatConfig = {
    env: buildAutonomousCompatEnv(config),
    connectors: {
      ...(config.telegramBotToken
        ? {
            telegram: {
              botToken: config.telegramBotToken,
            },
          }
        : {}),
      ...(config.discordBotToken
        ? {
            discord: {
              token: config.discordBotToken,
            },
          }
        : {}),
    },
    features: {
      shell: { enabled: true },
      cron: { enabled: true },
      browser: { enabled: true },
      personality: { enabled: true },
      experience: { enabled: true },
      agentSkills: { enabled: true },
    },
    agents: {
      defaults: {},
    },
  };

  if (config.elizaCloudEnabled) {
    compatConfig.cloud = {
      enabled: config.elizaCloudEnabled,
      provider: "elizacloud",
      inferenceMode: "cloud",
      runtime: "cloud",
      ...(config.elizaCloudApiKey
        ? {
            apiKey: config.elizaCloudApiKey,
          }
        : {}),
    };
    compatConfig.models = {
      small: config.elizaCloudSmallModel,
      large: config.elizaCloudLargeModel,
    };
  }

  if (config.useLinkedCodexAuth) {
    applySubscriptionProviderConfig(
      compatConfig as never,
      "openai-subscription",
    );
  } else if (config.useLinkedDevinAuth) {
    compatConfig.agents = {
      defaults: {
        model: {
          primary: config.devinModel,
        },
      },
    };
  } else if (config.useLinkedClaudeCodeAuth || config.claudeCodeCliFallback) {
    applySubscriptionProviderConfig(
      compatConfig as never,
      "anthropic-subscription",
    );
  } else {
    const primaryModel = resolveAutonomousPrimaryModel(config);
    if (primaryModel) {
      compatConfig.agents = {
        defaults: {
          model: {
            primary: primaryModel,
          },
        },
      };
    }
  }

  return compatConfig;
}

export function buildAutonomousCompatSnapshot(
  config?: EnvConfig,
): AutonomousCompatSnapshot | undefined {
  if (!config) {
    return undefined;
  }

  const compatConfig = createAutonomousCompatConfig(config);
  const env = compatConfig.env;
  const connection = resolveExistingOnboardingConnection(compatConfig);
  const pluginAutoEnable = resolvePluginAutoEnable(compatConfig);

  return {
    env,
    config: compatConfig,
    connection,
    pluginAutoEnable: {
      allow: pluginAutoEnable.allow,
      changes: pluginAutoEnable.changes,
    },
  };
}
