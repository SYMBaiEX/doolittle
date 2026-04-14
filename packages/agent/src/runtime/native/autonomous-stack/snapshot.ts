import {
  applySubscriptionProviderConfig,
  resolveExistingOnboardingConnection,
} from "@elizaos/autonomous/api/provider-switch-config";
import { applyPluginAutoEnable } from "@elizaos/autonomous/config/plugin-auto-enable";
import type { EnvConfig } from "@/types/runtime";
import { buildAutonomousCompatEnv } from "./compat-env";
import type { AutonomousCompatConfig, AutonomousCompatSnapshot } from "./types";

function resolveAutonomousPrimaryModel(config: EnvConfig): string | undefined {
  if (config.useLinkedCodexAuth) {
    return config.openAiModel;
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

  if (config.elizaCloudEnabled || config.elizaCloudApiKey) {
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
  const pluginAutoEnable = applyPluginAutoEnable({
    config: compatConfig as never,
    env,
  });

  return {
    env,
    config: compatConfig,
    connection,
    pluginAutoEnable: {
      allow: pluginAutoEnable.config.plugins?.allow ?? [],
      changes: pluginAutoEnable.changes,
    },
  };
}
