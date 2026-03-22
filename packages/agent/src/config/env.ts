import { mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import type { EnvConfig } from "@/types";

loadEnv();

function defaultRepoRoot(): string {
  return fileURLToPath(new URL("../../../../", import.meta.url));
}

function resolveFromRepoRoot(value: string): string {
  return isAbsolute(value) ? value : resolve(defaultRepoRoot(), value);
}

const schema = z.object({
  ELIZA_AGENT_NAME: z.string().default("Eliza Agent"),
  ELIZA_AGENT_MODE: z.enum(["api", "cli", "both"]).default("both"),
  ELIZA_AGENT_HOST: z.string().default("0.0.0.0"),
  ELIZA_AGENT_PORT: z.coerce.number().int().positive().default(3000),
  ELIZA_AGENT_DATA_DIR: z.string().default(".eliza-agent"),
  ELIZA_AGENT_SKILLS_DIR: z.string().default("./packages/skills"),
  ELIZA_AGENT_TIMEZONE: z.string().default("America/Chicago"),
  OPENAI_API_KEY: z.string().optional(),
  ELIZA_AGENT_USE_LINKED_CODEX_AUTH: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_IMAGE_MODEL: z.string().optional(),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
  OPENAI_MAX_TOKENS: z.coerce.number().int().positive().default(1200),
  ANTHROPIC_API_KEY: z.string().optional(),
  ELIZA_AGENT_USE_LINKED_CLAUDE_CODE_AUTH: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ELIZA_AGENT_CLAUDE_CODE_CLI_FALLBACK: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ANTHROPIC_BASE_URL: z.string().optional(),
  ANTHROPIC_SMALL_MODEL: z.string().default("claude-3-5-haiku-20241022"),
  ANTHROPIC_LARGE_MODEL: z.string().default("claude-sonnet-4-20250514"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_API_ROOT: z.string().optional(),
  TELEGRAM_ALLOWED_CHATS: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  SIGNAL_CLI_COMMAND: z.string().optional(),
  MATRIX_HOMESERVER: z.string().optional(),
  MATRIX_ACCESS_TOKEN: z.string().optional(),
  EMAIL_SEND_COMMAND: z.string().optional(),
  FAL_API_KEY: z.string().optional(),
  SMS_SEND_COMMAND: z.string().optional(),
  MATTERMOST_URL: z.string().optional(),
  MATTERMOST_TOKEN: z.string().optional(),
  HOMEASSISTANT_URL: z.string().optional(),
  HOMEASSISTANT_TOKEN: z.string().optional(),
  DINGTALK_WEBHOOK_URL: z.string().optional(),
  DINGTALK_ACCESS_TOKEN: z.string().optional(),
  ELIZA_AGENT_BROWSER_PROVIDER: z
    .enum(["lightpanda", "basic"])
    .default("lightpanda"),
  ELIZA_AGENT_BROWSER_COMMAND: z.string().default("lightpanda"),
  ELIZA_AGENT_BROWSER_CDP_URL: z.string().optional(),
  ELIZA_AGENT_BROWSER_OBEY_ROBOTS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  ELIZA_AGENT_REMOTE_SYNC_MODE: z
    .enum(["mirror", "snapshot"])
    .default("mirror"),
  ELIZA_AGENT_REMOTE_SYNC_INCLUDE: z.string().default("**/*"),
  ELIZA_AGENT_REMOTE_SYNC_EXCLUDE: z
    .string()
    .default(
      ".git,.eliza-agent,node_modules,dist,coverage,.cache,.turbo,.DS_Store",
    ),
  ELIZA_AGENT_REMOTE_ARTIFACT_PATHS: z
    .string()
    .default(
      ".eliza-agent/remote-artifacts,.eliza-agent/trajectories,.eliza-agent/cron-output",
    ),
  ELIZA_AGENT_REMOTE_ARTIFACT_POLICY: z
    .enum(["metadata-only", "allowlisted"])
    .default("metadata-only"),
  ELIZA_AGENT_REMOTE_WORKSPACE_LABEL: z
    .string()
    .default("eliza-agent-workspace"),
  ELIZA_AGENT_EXECUTION_BACKEND: z
    .enum([
      "local",
      "docker",
      "podman",
      "ssh",
      "singularity",
      "daytona",
      "modal",
    ])
    .default("local"),
  ELIZA_AGENT_DOCKER_IMAGE: z.string().default("oven/bun:latest"),
  ELIZA_AGENT_DOCKER_NETWORK: z.string().default("host"),
  ELIZA_AGENT_DOCKER_WORKSPACE_PATH: z.string().default("/workspace"),
  ELIZA_AGENT_DOCKER_ENV_PASSTHROUGH: z
    .string()
    .default("PATH,HOME,OPENAI_API_KEY,ANTHROPIC_API_KEY"),
  ELIZA_AGENT_SINGULARITY_IMAGE: z.string().default(""),
  ELIZA_AGENT_DAYTONA_TARGET: z.string().optional(),
  ELIZA_AGENT_DAYTONA_COMMAND: z.string().optional(),
  ELIZA_AGENT_DAYTONA_SHELL: z.string().default("/bin/sh"),
  ELIZA_AGENT_DAYTONA_WORKSPACE_PATH: z.string().default("/workspace"),
  ELIZA_AGENT_DAYTONA_SNAPSHOT: z.string().optional(),
  ELIZA_AGENT_DAYTONA_BOOTSTRAP_COMMAND: z.string().optional(),
  ELIZA_AGENT_DAYTONA_STATUS_COMMAND: z.string().optional(),
  ELIZA_AGENT_DAYTONA_INSPECT_COMMAND: z.string().optional(),
  ELIZA_AGENT_MODAL_TARGET: z.string().optional(),
  ELIZA_AGENT_MODAL_COMMAND: z.string().optional(),
  ELIZA_AGENT_MODAL_SHELL: z.string().default("/bin/bash"),
  ELIZA_AGENT_MODAL_WORKSPACE_PATH: z.string().default("/workspace"),
  ELIZA_AGENT_MODAL_ENVIRONMENT: z.string().optional(),
  ELIZA_AGENT_MODAL_BOOTSTRAP_COMMAND: z.string().optional(),
  ELIZA_AGENT_MODAL_STATUS_COMMAND: z.string().optional(),
  ELIZA_AGENT_MODAL_INSPECT_COMMAND: z.string().optional(),
  ELIZA_AGENT_EXECUTION_COMMAND_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30_000),
  ELIZA_AGENT_EXECUTION_HEALTH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5_000),
  ELIZA_AGENT_CONTAINER_CPU_LIMIT: z.string().default("2"),
  ELIZA_AGENT_CONTAINER_MEMORY_LIMIT: z.string().default("2g"),
  ELIZA_AGENT_CONTAINER_PIDS_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(256),
  ELIZA_AGENT_CONTAINER_READ_ONLY_ROOT: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  ELIZA_AGENT_SSH_HOST: z.string().optional(),
  ELIZA_AGENT_SSH_USER: z.string().optional(),
  ELIZA_AGENT_SSH_PATH: z.string().optional(),
  ELIZA_AGENT_SSH_PORT: z.coerce.number().int().positive().default(22),
  ELIZA_AGENT_SSH_KEY_PATH: z.string().optional(),
  ELIZA_AGENT_SSH_STRICT_HOST_KEY_CHECKING: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ELIZA_AGENT_MEMORY_CHAR_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(2200),
  ELIZA_AGENT_USER_CHAR_LIMIT: z.coerce.number().int().positive().default(1375),
  ELIZA_AGENT_SESSION_SEARCH_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(6),
  ELIZA_AGENT_CRON_TICK_SECONDS: z.coerce.number().int().positive().default(30),
  ELIZA_AGENT_CRON_OUTPUT_DIR: z.string().default(".eliza-agent/cron-output"),
  ELIZA_AGENT_GATEWAY_DATA_DIR: z.string().default(".eliza-agent/gateway"),
  ELIZA_AGENT_HOOKS_DIR: z.string().default(".eliza-agent/hooks"),
  ELIZA_AGENT_WORKSPACE_DIR: z.string().default("."),
  ELIZA_AGENT_ALLOW_ALL_USERS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ELIZA_AGENT_PAIRING_MODE: z.enum(["pair", "deny", "allow"]).default("pair"),
  MCP_SERVER_COMMAND: z.string().optional(),
  MCP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  ACP_SERVER_COMMAND: z.string().optional(),
  ACP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export function loadConfig(): EnvConfig {
  const values = schema.parse(process.env);
  const dataDir = resolveFromRepoRoot(values.ELIZA_AGENT_DATA_DIR);
  const skillsDir = resolveFromRepoRoot(values.ELIZA_AGENT_SKILLS_DIR);
  const cronOutputDir = resolveFromRepoRoot(values.ELIZA_AGENT_CRON_OUTPUT_DIR);
  const gatewayDataDir = resolveFromRepoRoot(
    values.ELIZA_AGENT_GATEWAY_DATA_DIR,
  );
  const hooksDir = resolveFromRepoRoot(values.ELIZA_AGENT_HOOKS_DIR);
  const workspaceDir = resolveFromRepoRoot(values.ELIZA_AGENT_WORKSPACE_DIR);

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(cronOutputDir, { recursive: true });
  mkdirSync(gatewayDataDir, { recursive: true });
  mkdirSync(hooksDir, { recursive: true });

  return {
    agentName: values.ELIZA_AGENT_NAME,
    mode: values.ELIZA_AGENT_MODE,
    host: values.ELIZA_AGENT_HOST,
    port: values.ELIZA_AGENT_PORT,
    dataDir,
    skillsDir,
    timezone: values.ELIZA_AGENT_TIMEZONE,
    openAiApiKey: values.OPENAI_API_KEY,
    useLinkedCodexAuth: values.ELIZA_AGENT_USE_LINKED_CODEX_AUTH,
    openAiBaseUrl: values.OPENAI_BASE_URL,
    openAiModel: values.OPENAI_MODEL,
    openAiImageModel: values.OPENAI_IMAGE_MODEL,
    openAiTemperature: values.OPENAI_TEMPERATURE,
    openAiMaxTokens: values.OPENAI_MAX_TOKENS,
    anthropicApiKey: values.ANTHROPIC_API_KEY,
    useLinkedClaudeCodeAuth: values.ELIZA_AGENT_USE_LINKED_CLAUDE_CODE_AUTH,
    claudeCodeCliFallback: values.ELIZA_AGENT_CLAUDE_CODE_CLI_FALLBACK,
    anthropicBaseUrl: values.ANTHROPIC_BASE_URL,
    anthropicSmallModel: values.ANTHROPIC_SMALL_MODEL,
    anthropicLargeModel: values.ANTHROPIC_LARGE_MODEL,
    telegramBotToken: values.TELEGRAM_BOT_TOKEN,
    telegramApiRoot: values.TELEGRAM_API_ROOT,
    telegramAllowedChats: values.TELEGRAM_ALLOWED_CHATS,
    discordBotToken: values.DISCORD_BOT_TOKEN,
    slackWebhookUrl: values.SLACK_WEBHOOK_URL,
    slackSigningSecret: values.SLACK_SIGNING_SECRET,
    whatsappAccessToken: values.WHATSAPP_ACCESS_TOKEN,
    whatsappPhoneNumberId: values.WHATSAPP_PHONE_NUMBER_ID,
    whatsappVerifyToken: values.WHATSAPP_VERIFY_TOKEN,
    signalCliCommand: values.SIGNAL_CLI_COMMAND,
    matrixHomeserver: values.MATRIX_HOMESERVER,
    matrixAccessToken: values.MATRIX_ACCESS_TOKEN,
    emailSendCommand: values.EMAIL_SEND_COMMAND,
    falApiKey: values.FAL_API_KEY,
    smsSendCommand: values.SMS_SEND_COMMAND,
    mattermostUrl: values.MATTERMOST_URL,
    mattermostToken: values.MATTERMOST_TOKEN,
    homeAssistantUrl: values.HOMEASSISTANT_URL,
    homeAssistantToken: values.HOMEASSISTANT_TOKEN,
    dingtalkWebhookUrl: values.DINGTALK_WEBHOOK_URL,
    dingtalkAccessToken: values.DINGTALK_ACCESS_TOKEN,
    browserProvider: values.ELIZA_AGENT_BROWSER_PROVIDER,
    browserCommand: values.ELIZA_AGENT_BROWSER_COMMAND,
    browserCdpUrl: values.ELIZA_AGENT_BROWSER_CDP_URL,
    browserObeyRobots: values.ELIZA_AGENT_BROWSER_OBEY_ROBOTS,
    remoteSyncMode: values.ELIZA_AGENT_REMOTE_SYNC_MODE,
    remoteSyncInclude: values.ELIZA_AGENT_REMOTE_SYNC_INCLUDE.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    remoteSyncExclude: values.ELIZA_AGENT_REMOTE_SYNC_EXCLUDE.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    remoteArtifactPaths: values.ELIZA_AGENT_REMOTE_ARTIFACT_PATHS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    remoteArtifactPolicy: values.ELIZA_AGENT_REMOTE_ARTIFACT_POLICY,
    remoteWorkspaceLabel: values.ELIZA_AGENT_REMOTE_WORKSPACE_LABEL,
    executionBackend: values.ELIZA_AGENT_EXECUTION_BACKEND,
    dockerImage: values.ELIZA_AGENT_DOCKER_IMAGE,
    dockerNetwork: values.ELIZA_AGENT_DOCKER_NETWORK,
    dockerWorkspacePath: values.ELIZA_AGENT_DOCKER_WORKSPACE_PATH,
    dockerEnvPassthrough: values.ELIZA_AGENT_DOCKER_ENV_PASSTHROUGH.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    singularityImage: values.ELIZA_AGENT_SINGULARITY_IMAGE,
    daytonaTarget: values.ELIZA_AGENT_DAYTONA_TARGET,
    daytonaCommand: values.ELIZA_AGENT_DAYTONA_COMMAND,
    daytonaShell: values.ELIZA_AGENT_DAYTONA_SHELL,
    daytonaWorkspacePath: values.ELIZA_AGENT_DAYTONA_WORKSPACE_PATH,
    daytonaSnapshot: values.ELIZA_AGENT_DAYTONA_SNAPSHOT,
    daytonaBootstrapCommand: values.ELIZA_AGENT_DAYTONA_BOOTSTRAP_COMMAND,
    daytonaStatusCommand: values.ELIZA_AGENT_DAYTONA_STATUS_COMMAND,
    daytonaInspectCommand: values.ELIZA_AGENT_DAYTONA_INSPECT_COMMAND,
    modalTarget: values.ELIZA_AGENT_MODAL_TARGET,
    modalCommand: values.ELIZA_AGENT_MODAL_COMMAND,
    modalShell: values.ELIZA_AGENT_MODAL_SHELL,
    modalWorkspacePath: values.ELIZA_AGENT_MODAL_WORKSPACE_PATH,
    modalEnvironment: values.ELIZA_AGENT_MODAL_ENVIRONMENT,
    modalBootstrapCommand: values.ELIZA_AGENT_MODAL_BOOTSTRAP_COMMAND,
    modalStatusCommand: values.ELIZA_AGENT_MODAL_STATUS_COMMAND,
    modalInspectCommand: values.ELIZA_AGENT_MODAL_INSPECT_COMMAND,
    executionCommandTimeoutMs: values.ELIZA_AGENT_EXECUTION_COMMAND_TIMEOUT_MS,
    executionHealthTimeoutMs: values.ELIZA_AGENT_EXECUTION_HEALTH_TIMEOUT_MS,
    containerCpuLimit: values.ELIZA_AGENT_CONTAINER_CPU_LIMIT,
    containerMemoryLimit: values.ELIZA_AGENT_CONTAINER_MEMORY_LIMIT,
    containerPidsLimit: values.ELIZA_AGENT_CONTAINER_PIDS_LIMIT,
    containerReadOnlyRoot: values.ELIZA_AGENT_CONTAINER_READ_ONLY_ROOT,
    sshHost: values.ELIZA_AGENT_SSH_HOST,
    sshUser: values.ELIZA_AGENT_SSH_USER,
    sshPath: values.ELIZA_AGENT_SSH_PATH,
    sshPort: values.ELIZA_AGENT_SSH_PORT,
    sshKeyPath: values.ELIZA_AGENT_SSH_KEY_PATH,
    sshStrictHostKeyChecking: values.ELIZA_AGENT_SSH_STRICT_HOST_KEY_CHECKING,
    mcpServerCommand: values.MCP_SERVER_COMMAND,
    mcpTimeoutMs: values.MCP_TIMEOUT_MS,
    acpServerCommand: values.ACP_SERVER_COMMAND,
    acpTimeoutMs: values.ACP_TIMEOUT_MS,
    memoryCharLimit: values.ELIZA_AGENT_MEMORY_CHAR_LIMIT,
    userCharLimit: values.ELIZA_AGENT_USER_CHAR_LIMIT,
    sessionSearchLimit: values.ELIZA_AGENT_SESSION_SEARCH_LIMIT,
    cronTickSeconds: values.ELIZA_AGENT_CRON_TICK_SECONDS,
    cronOutputDir,
    gatewayDataDir,
    hooksDir,
    workspaceDir,
    allowAllUsers: values.ELIZA_AGENT_ALLOW_ALL_USERS,
    pairingDefaultMode: values.ELIZA_AGENT_PAIRING_MODE,
  };
}
