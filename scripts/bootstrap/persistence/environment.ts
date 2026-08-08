import type { WizardAnswers } from "../types";

export function buildBootstrapEnvUpdates(
  answers: WizardAnswers,
): Record<string, string | undefined> {
  return {
    DOOLITTLE_NAME: answers.agentName,
    DOOLITTLE_MODE: "cli",
    DOOLITTLE_TIMEZONE: answers.timezone,
    DOOLITTLE_RUN_DEPTH: answers.runDepth,
    DOOLITTLE_TOOL_PROGRESS: answers.toolProgressMode,
    DOOLITTLE_MAX_ITERATIONS: String(answers.maxIterations),
    ELIZAOS_CLOUD_ENABLED: String(
      answers.provider === "elizacloud" && Boolean(answers.elizaCloudApiKey),
    ),
    ELIZAOS_CLOUD_API_KEY: answers.elizaCloudApiKey,
    ELIZAOS_CLOUD_BASE_URL: "https://elizacloud.ai/api/v1",
    ELIZAOS_CLOUD_SMALL_MODEL: answers.elizaCloudSmallModel,
    ELIZAOS_CLOUD_LARGE_MODEL: answers.elizaCloudModel,
    ELIZAOS_CLOUD_EMBEDDING_MODEL: answers.elizaCloudEmbeddingModel,
    OLLAMA_API_ENDPOINT: answers.ollamaApiEndpoint,
    OLLAMA_SMALL_MODEL: answers.ollamaSmallModel,
    OLLAMA_LARGE_MODEL: answers.ollamaLargeModel,
    OLLAMA_EMBEDDING_MODEL: answers.ollamaEmbeddingModel,
    DOOLITTLE_EMBEDDING_PROVIDER: "local",
    OPENAI_API_KEY:
      answers.provider === "openai" || answers.provider === "hybrid"
        ? answers.openaiApiKey
        : "",
    DOOLITTLE_USE_LINKED_CODEX_AUTH: String(
      answers.provider === "codex" || answers.provider === "hybrid",
    ),
    OPENAI_MODEL:
      answers.provider === "openai" ||
      answers.provider === "hybrid" ||
      answers.provider === "codex"
        ? answers.openaiModel
        : "gpt-5.4",
    DOOLITTLE_USE_LINKED_DEVIN_AUTH: String(answers.provider === "devin"),
    DEVIN_CLI_COMMAND: answers.devinCliCommand || "devin",
    DEVIN_MODEL: answers.devinModel || "swe-1-6-fast",
    DEVIN_TIMEOUT_MS: String(answers.devinTimeoutMs || 120_000),
    ANTHROPIC_API_KEY:
      answers.provider === "anthropic" || answers.provider === "hybrid"
        ? answers.anthropicApiKey
        : "",
    CLAUDE_CODE_OAUTH_TOKEN:
      answers.provider === "claude-code" && !answers.claudeCodeCliFallback
        ? answers.claudeCodeOauthToken
        : "",
    DOOLITTLE_USE_LINKED_CLAUDE_CODE_AUTH: String(
      answers.provider === "claude-code" || answers.provider === "hybrid",
    ),
    DOOLITTLE_CLAUDE_CODE_CLI_FALLBACK: String(
      answers.provider === "claude-code" && answers.claudeCodeCliFallback,
    ),
    ANTHROPIC_LARGE_MODEL:
      answers.provider === "anthropic" ||
      answers.provider === "hybrid" ||
      answers.provider === "claude-code"
        ? answers.anthropicModel
        : "claude-sonnet-4.6",
    TELEGRAM_BOT_TOKEN: answers.telegramBotToken,
    DISCORD_BOT_TOKEN: answers.discordBotToken,
    DISCORD_APPLICATION_ID: answers.discordApplicationId ?? "",
    SLACK_BOT_TOKEN: answers.slackBotToken ?? "",
    SLACK_APP_TOKEN: answers.slackAppToken ?? "",
    SLACK_USER_TOKEN: answers.slackUserToken ?? "",
    SLACK_WEBHOOK_URL: answers.slackWebhookUrl,
    SLACK_SIGNING_SECRET: answers.slackSigningSecret,
    WHATSAPP_ACCESS_TOKEN: answers.whatsappAccessToken ?? "",
    WHATSAPP_PHONE_NUMBER_ID: answers.whatsappPhoneNumberId ?? "",
    WHATSAPP_VERIFY_TOKEN: answers.whatsappVerifyToken ?? "",
    WHATSAPP_APP_SECRET: answers.whatsappAppSecret ?? "",
    SIGNAL_ACCOUNT_NUMBER: answers.signalAccountNumber ?? "",
    SIGNAL_HTTP_URL: answers.signalHttpUrl ?? "",
    SIGNAL_CLI_PATH: answers.signalCliPath ?? "",
    SIGNAL_CLI_COMMAND: answers.signalCliCommand ?? "",
    HOMEASSISTANT_URL: answers.homeAssistantUrl,
    HOMEASSISTANT_TOKEN: answers.homeAssistantToken,
    // MCP configuration is canonical in settings.mcp.servers. Clear the
    // legacy bootstrap import after projecting it into native Eliza settings.
    MCP_SERVER_COMMAND: "",
    ACP_SERVER_COMMAND: answers.tools.acp ? answers.acpServerCommand : "",
    FAL_API_KEY: answers.tools.tts ? answers.falApiKey : "",
    E2B_API_KEY: answers.tools.codegen ? answers.e2bApiKey : "",
    GITHUB_TOKEN: answers.tools.codegen ? answers.githubToken : "",
    DOOLITTLE_EXECUTION_BACKEND: answers.backend,
    DOOLITTLE_BROWSER_PROVIDER: answers.browser,
    DOOLITTLE_ALLOW_ALL_USERS: String(answers.allowAllUsers),
    DOOLITTLE_PAIRING_MODE: answers.pairingMode,
    DOOLITTLE_SSH_HOST: answers.backend === "ssh" ? answers.sshHost : "",
    DOOLITTLE_SSH_USER: answers.backend === "ssh" ? answers.sshUser : "",
    DOOLITTLE_SSH_PATH: answers.backend === "ssh" ? answers.sshPath : "",
    DOOLITTLE_DAYTONA_TARGET:
      answers.backend === "daytona" ? answers.daytonaTarget : "",
    DOOLITTLE_MODAL_TARGET:
      answers.backend === "modal" ? answers.modalTarget : "",
  };
}
