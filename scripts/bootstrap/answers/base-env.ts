import { DEFAULT_TUI_THEME } from "../../../packages/agent/src/runtime/theme-catalog";
import {
  resolveMaxIterations,
  resolveRunDepth,
  resolveToolProgressMode,
} from "../core/runtime-flags";
import type { WizardAnswers } from "../types";
import {
  normalizeElizaCloudEmbeddingModel,
  normalizeElizaCloudLargeModel,
  normalizeElizaCloudSmallModel,
} from "./model-normalization";

/**
 * Reads all env-derivable WizardAnswers fields that are identical between
 * headless and interactive modes. Callers layer in mode, provider, and
 * the three linked-auth flags that differ between the two paths.
 */
export function readEnvBase(existingEnv: Map<string, string>) {
  const elizaCloudApiKey = existingEnv.get("ELIZAOS_CLOUD_API_KEY") || "";
  return {
    agentName: existingEnv.get("DOOLITTLE_NAME") || "Doolittle",
    timezone: existingEnv.get("DOOLITTLE_TIMEZONE") || "America/Chicago",
    theme: DEFAULT_TUI_THEME,
    backend:
      (existingEnv.get(
        "DOOLITTLE_EXECUTION_BACKEND",
      ) as WizardAnswers["backend"]) || "local",
    browser:
      (existingEnv.get(
        "DOOLITTLE_BROWSER_PROVIDER",
      ) as WizardAnswers["browser"]) || "lightpanda",
    runDepth: resolveRunDepth(existingEnv.get("DOOLITTLE_RUN_DEPTH")),
    maxIterations: resolveMaxIterations(existingEnv),
    toolProgressMode: resolveToolProgressMode(
      existingEnv.get("DOOLITTLE_TOOL_PROGRESS"),
    ),
    pairingMode:
      (existingEnv.get(
        "DOOLITTLE_PAIRING_MODE",
      ) as WizardAnswers["pairingMode"]) || "pair",
    allowAllUsers: existingEnv.get("DOOLITTLE_ALLOW_ALL_USERS") === "true",
    transports: [] as WizardAnswers["transports"],
    tools: {
      mcp: Boolean(existingEnv.get("MCP_SERVER_COMMAND")),
      acp: Boolean(existingEnv.get("ACP_SERVER_COMMAND")),
      tts: Boolean(existingEnv.get("FAL_API_KEY")),
      codegen: Boolean(
        existingEnv.get("E2B_API_KEY") || existingEnv.get("GITHUB_TOKEN"),
      ),
    },
    openaiApiKey: existingEnv.get("OPENAI_API_KEY") || "",
    openaiModel: existingEnv.get("OPENAI_MODEL") || "gpt-5.4",
    elizaCloudApiKey,
    elizaCloudSmallModel: normalizeElizaCloudSmallModel(
      existingEnv.get("ELIZAOS_CLOUD_SMALL_MODEL"),
    ),
    elizaCloudModel: normalizeElizaCloudLargeModel(
      existingEnv.get("ELIZAOS_CLOUD_LARGE_MODEL"),
    ),
    elizaCloudEmbeddingModel: normalizeElizaCloudEmbeddingModel(
      existingEnv.get("ELIZAOS_CLOUD_EMBEDDING_MODEL"),
    ),
    anthropicApiKey: existingEnv.get("ANTHROPIC_API_KEY") || "",
    claudeCodeCliFallback:
      existingEnv.get("DOOLITTLE_CLAUDE_CODE_CLI_FALLBACK") === "true",
    claudeCodeOauthToken:
      existingEnv.get("CLAUDE_CODE_OAUTH_TOKEN") ||
      existingEnv.get("CLAUDE_CODE_SETUP_TOKEN") ||
      "",
    anthropicModel:
      existingEnv.get("ANTHROPIC_LARGE_MODEL") || "claude-sonnet-4.6",
    telegramBotToken: existingEnv.get("TELEGRAM_BOT_TOKEN") || "",
    discordBotToken: existingEnv.get("DISCORD_BOT_TOKEN") || "",
    slackWebhookUrl: existingEnv.get("SLACK_WEBHOOK_URL") || "",
    slackSigningSecret: existingEnv.get("SLACK_SIGNING_SECRET") || "",
    homeAssistantUrl: existingEnv.get("HOMEASSISTANT_URL") || "",
    homeAssistantToken: existingEnv.get("HOMEASSISTANT_TOKEN") || "",
    mcpServerCommand: existingEnv.get("MCP_SERVER_COMMAND") || "",
    acpServerCommand: existingEnv.get("ACP_SERVER_COMMAND") || "",
    falApiKey: existingEnv.get("FAL_API_KEY") || "",
    e2bApiKey: existingEnv.get("E2B_API_KEY") || "",
    githubToken: existingEnv.get("GITHUB_TOKEN") || "",
    sshHost: existingEnv.get("DOOLITTLE_SSH_HOST") || "",
    sshUser: existingEnv.get("DOOLITTLE_SSH_USER") || "",
    sshPath: existingEnv.get("DOOLITTLE_SSH_PATH") || "",
    daytonaTarget: existingEnv.get("DOOLITTLE_DAYTONA_TARGET") || "",
    modalTarget: existingEnv.get("DOOLITTLE_MODAL_TARGET") || "",
  };
}
