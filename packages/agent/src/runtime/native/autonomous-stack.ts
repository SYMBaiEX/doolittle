import type {} from "@elizaos/agent";
import type {} from "@elizaos/autonomous";
import { applyPluginAutoEnable } from "@elizaos/autonomous/config/plugin-auto-enable";
import type {} from "@elizaos/skills";
import type { EnvConfig } from "@/types";

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

function buildAutonomousCompatConfig(config: EnvConfig) {
  return {
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
  };
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
  };
}
