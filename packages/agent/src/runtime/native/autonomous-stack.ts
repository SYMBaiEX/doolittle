import type {} from "@elizaos/agent";
import type {} from "@elizaos/autonomous";
import {
  applySubscriptionProviderConfig,
  resolveExistingOnboardingConnection,
} from "@elizaos/autonomous/api/provider-switch-config";
import { applyPluginAutoEnable } from "@elizaos/autonomous/config/plugin-auto-enable";
import {
  getOnboardingProviderOption,
  type OnboardingConnection,
} from "@elizaos/autonomous/contracts/onboarding";
import type {} from "@elizaos/skills";
import type { EnvConfig } from "@/types/runtime";

export const autonomousFoundationPackages = [
  "@elizaos/agent",
  "@elizaos/autonomous",
  "@elizaos/skills",
] as const;

export const autonomousPatternAreas = [
  "skills-runtime-wiring",
  "agent-orchestration",
  "coding-agent-integration",
  "trajectory-logging",
  "plugin-centric-runtime-assembly",
  "action-bench-evaluation",
  "autocoder-swe-bench-evaluation",
  "tts-voice-generation",
] as const;

interface AutonomousConnectionSummary {
  source: "provider-switch-config";
  configured: boolean;
  kind: OnboardingConnection["kind"] | "missing";
  provider: string | null;
  detail: string;
  primaryModel?: string;
  smallModel?: string;
  largeModel?: string;
  remoteApiBase?: string;
}

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

function buildAutonomousCompatConfig(
  config: EnvConfig,
): Record<string, unknown> {
  const compatConfig: Record<string, unknown> = {
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

function buildAutonomousCompatEnv(config: EnvConfig): NodeJS.ProcessEnv {
  return {
    ...(config.elizaCloudApiKey
      ? {
          ELIZAOS_CLOUD_API_KEY: config.elizaCloudApiKey,
        }
      : {}),
    ...(config.elizaCloudEnabled
      ? {
          ELIZAOS_CLOUD_ENABLED: "true",
        }
      : {}),
    ...(config.openAiApiKey
      ? {
          OPENAI_API_KEY: config.openAiApiKey,
        }
      : {}),
    ...(config.anthropicApiKey
      ? {
          ANTHROPIC_API_KEY: config.anthropicApiKey,
        }
      : {}),
    ...(config.telegramBotToken
      ? {
          TELEGRAM_BOT_TOKEN: config.telegramBotToken,
        }
      : {}),
    ...(config.discordBotToken
      ? {
          DISCORD_BOT_TOKEN: config.discordBotToken,
        }
      : {}),
  };
}

export function summarizeAutonomousConnection(
  config?: EnvConfig,
): AutonomousConnectionSummary {
  if (!config) {
    return {
      source: "provider-switch-config",
      configured: false,
      kind: "missing",
      provider: null,
      detail:
        "No EnvConfig was supplied, so the native connection view could not be resolved.",
    };
  }

  const connection = resolveExistingOnboardingConnection(
    buildAutonomousCompatConfig(config),
  );
  if (!connection) {
    return {
      source: "provider-switch-config",
      configured: false,
      kind: "missing",
      provider: null,
      detail:
        "No native cloud-managed, local-provider, or remote-provider connection could be derived from the current env.",
    };
  }

  if (connection.kind === "cloud-managed") {
    return {
      source: "provider-switch-config",
      configured: true,
      kind: connection.kind,
      provider: connection.cloudProvider,
      detail: `cloud-managed via Eliza Cloud (${connection.smallModel ?? "small-model-unset"} / ${connection.largeModel ?? "large-model-unset"})`,
      smallModel: connection.smallModel,
      largeModel: connection.largeModel,
    };
  }

  if (connection.kind === "remote-provider") {
    const providerLabel = connection.provider
      ? (getOnboardingProviderOption(connection.provider)?.name ??
        connection.provider)
      : "none";
    return {
      source: "provider-switch-config",
      configured: true,
      kind: connection.kind,
      provider: connection.provider ?? "remote",
      detail: `remote-provider via ${connection.remoteApiBase} (local=${providerLabel}${connection.primaryModel ? ` model=${connection.primaryModel}` : ""})`,
      primaryModel: connection.primaryModel,
      remoteApiBase: connection.remoteApiBase,
    };
  }

  const providerLabel =
    getOnboardingProviderOption(connection.provider)?.name ??
    connection.provider;
  return {
    source: "provider-switch-config",
    configured: true,
    kind: connection.kind,
    provider: connection.provider,
    detail: `local-provider via ${providerLabel}${connection.primaryModel ? ` (${connection.primaryModel})` : ""}`,
    primaryModel: connection.primaryModel,
  };
}

export function describeAutonomousAlignment(config?: EnvConfig) {
  const autoEnable = config
    ? applyPluginAutoEnable({
        config: buildAutonomousCompatConfig(config) as never,
        env: buildAutonomousCompatEnv(config),
      })
    : undefined;
  return {
    foundationPackages: [...autonomousFoundationPackages],
    patternAreas: [...autonomousPatternAreas],
    nativeControlPlanes: [
      "agent-sdk",
      "agent-skills",
      "agent-orchestrator",
      "trajectory-logger",
      "plugin-manager",
      "trigger-scheduling",
      "action-bench",
      "autocoder",
      "tts",
    ],
    pluginAutoEnable: autoEnable
      ? {
          allow: autoEnable.config.plugins?.allow ?? [],
          changes: autoEnable.changes,
        }
      : {
          allow: [],
          changes: [],
        },
    connection: summarizeAutonomousConnection(config),
  };
}
