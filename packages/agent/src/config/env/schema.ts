import { resolveCloudApiBaseUrl } from "@elizaos/autonomous/cloud/base-url";
import { z } from "zod";

export const envSchema = z.object({
  DOOLITTLE_NAME: z.string().default("Doolittle"),
  DOOLITTLE_MODE: z.enum(["api", "cli", "both"]).default("both"),
  DOOLITTLE_HOST: z.string().default("0.0.0.0"),
  DOOLITTLE_PORT: z.coerce.number().int().positive().default(3000),
  DOOLITTLE_DATA_DIR: z.string().default(".doolittle"),
  DOOLITTLE_SKILLS_DIR: z.string().default("./packages/skills"),
  DOOLITTLE_TIMEZONE: z.string().default("America/Chicago"),
  ELIZAOS_CLOUD_API_KEY: z.string().optional(),
  ELIZAOS_CLOUD_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ELIZAOS_CLOUD_BASE_URL: z.string().default(resolveCloudApiBaseUrl()),
  ELIZAOS_CLOUD_SMALL_MODEL: z
    .string()
    .default("xai/grok-4.1-fast-non-reasoning"),
  ELIZAOS_CLOUD_LARGE_MODEL: z.string().default("xai/grok-4.1-fast-reasoning"),
  ELIZAOS_CLOUD_EMBEDDING_MODEL: z
    .string()
    .default("openai/text-embedding-3-small"),
  ELIZAOS_CLOUD_EMBEDDING_URL: z.string().optional(),
  ELIZAOS_CLOUD_EMBEDDING_API_KEY: z.string().optional(),
  ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  OLLAMA_API_ENDPOINT: z.string().default("http://localhost:11434/api"),
  OLLAMA_SMALL_MODEL: z.string().default("granite4.1:3b"),
  OLLAMA_LARGE_MODEL: z.string().default("granite4.1:3b"),
  OLLAMA_EMBEDDING_MODEL: z.string().default("nomic-embed-text:latest"),
  OPENAI_API_KEY: z.string().optional(),
  DOOLITTLE_OFFLINE_BOOTSTRAP: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DOOLITTLE_USE_LINKED_CODEX_AUTH: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DOOLITTLE_USE_LINKED_DEVIN_AUTH: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  DEVIN_CLI_COMMAND: z.string().default("devin"),
  DEVIN_MODEL: z.string().default("swe-1-6-fast"),
  DEVIN_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-5.4"),
  OPENAI_IMAGE_MODEL: z.string().optional(),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
  OPENAI_MAX_TOKENS: z.coerce.number().int().positive().default(1200),
  ANTHROPIC_API_KEY: z.string().optional(),
  DOOLITTLE_USE_LINKED_CLAUDE_CODE_AUTH: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DOOLITTLE_CLAUDE_CODE_CLI_FALLBACK: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ANTHROPIC_BASE_URL: z.string().optional(),
  ANTHROPIC_SMALL_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  ANTHROPIC_LARGE_MODEL: z.string().default("claude-sonnet-4.6"),
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
  DOOLITTLE_BROWSER_PROVIDER: z
    .enum(["lightpanda", "basic"])
    .default("lightpanda"),
  DOOLITTLE_BROWSER_COMMAND: z.string().default("lightpanda"),
  DOOLITTLE_BROWSER_CDP_URL: z.string().optional(),
  DOOLITTLE_BROWSER_OBEY_ROBOTS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  DOOLITTLE_REMOTE_SYNC_MODE: z.enum(["mirror", "snapshot"]).default("mirror"),
  DOOLITTLE_REMOTE_SYNC_INCLUDE: z.string().default("**/*"),
  DOOLITTLE_REMOTE_SYNC_EXCLUDE: z
    .string()
    .default(
      ".git,.doolittle,node_modules,dist,coverage,.cache,.turbo,.DS_Store",
    ),
  DOOLITTLE_REMOTE_ARTIFACT_PATHS: z
    .string()
    .default(
      ".doolittle/remote-artifacts,.doolittle/trajectories,.doolittle/cron-output",
    ),
  DOOLITTLE_REMOTE_ARTIFACT_POLICY: z
    .enum(["metadata-only", "allowlisted"])
    .default("metadata-only"),
  DOOLITTLE_REMOTE_WORKSPACE_LABEL: z.string().default("doolittle-workspace"),
  DOOLITTLE_EXECUTION_BACKEND: z
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
  DOOLITTLE_DOCKER_IMAGE: z.string().default("oven/bun:latest"),
  DOOLITTLE_DOCKER_NETWORK: z.string().default("host"),
  DOOLITTLE_DOCKER_WORKSPACE_PATH: z.string().default("/workspace"),
  DOOLITTLE_DOCKER_ENV_PASSTHROUGH: z
    .string()
    .default(
      "PATH,HOME,OLLAMA_API_ENDPOINT,OPENAI_API_KEY,ANTHROPIC_API_KEY,DEVIN_MODEL,DEVIN_CLI_COMMAND",
    ),
  DOOLITTLE_SINGULARITY_IMAGE: z.string().default(""),
  DOOLITTLE_DAYTONA_TARGET: z.string().optional(),
  DOOLITTLE_DAYTONA_COMMAND: z.string().optional(),
  DOOLITTLE_DAYTONA_SHELL: z.string().default("/bin/sh"),
  DOOLITTLE_DAYTONA_WORKSPACE_PATH: z.string().default("/workspace"),
  DOOLITTLE_DAYTONA_SNAPSHOT: z.string().optional(),
  DOOLITTLE_DAYTONA_BOOTSTRAP_COMMAND: z.string().optional(),
  DOOLITTLE_DAYTONA_STATUS_COMMAND: z.string().optional(),
  DOOLITTLE_DAYTONA_INSPECT_COMMAND: z.string().optional(),
  DOOLITTLE_MODAL_TARGET: z.string().optional(),
  DOOLITTLE_MODAL_COMMAND: z.string().optional(),
  DOOLITTLE_MODAL_SHELL: z.string().default("/bin/bash"),
  DOOLITTLE_MODAL_WORKSPACE_PATH: z.string().default("/workspace"),
  DOOLITTLE_MODAL_ENVIRONMENT: z.string().optional(),
  DOOLITTLE_MODAL_BOOTSTRAP_COMMAND: z.string().optional(),
  DOOLITTLE_MODAL_STATUS_COMMAND: z.string().optional(),
  DOOLITTLE_MODAL_INSPECT_COMMAND: z.string().optional(),
  DOOLITTLE_EXECUTION_COMMAND_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30_000),
  DOOLITTLE_EXECUTION_HEALTH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5_000),
  DOOLITTLE_CONTAINER_CPU_LIMIT: z.string().default("2"),
  DOOLITTLE_CONTAINER_MEMORY_LIMIT: z.string().default("2g"),
  DOOLITTLE_CONTAINER_PIDS_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(256),
  DOOLITTLE_CONTAINER_READ_ONLY_ROOT: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  DOOLITTLE_SSH_HOST: z.string().optional(),
  DOOLITTLE_SSH_USER: z.string().optional(),
  DOOLITTLE_SSH_PATH: z.string().optional(),
  DOOLITTLE_SSH_PORT: z.coerce.number().int().positive().default(22),
  DOOLITTLE_SSH_KEY_PATH: z.string().optional(),
  DOOLITTLE_SSH_STRICT_HOST_KEY_CHECKING: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DOOLITTLE_MEMORY_CHAR_LIMIT: z.coerce.number().int().positive().default(2200),
  DOOLITTLE_USER_CHAR_LIMIT: z.coerce.number().int().positive().default(1375),
  DOOLITTLE_SESSION_SEARCH_LIMIT: z.coerce.number().int().positive().default(6),
  DOOLITTLE_CRON_TICK_SECONDS: z.coerce.number().int().positive().default(30),
  DOOLITTLE_CRON_OUTPUT_DIR: z.string().default(".doolittle/cron-output"),
  DOOLITTLE_GATEWAY_DATA_DIR: z.string().default(".doolittle/gateway"),
  DOOLITTLE_HOOKS_DIR: z.string().default(".doolittle/hooks"),
  DOOLITTLE_WORKSPACE_DIR: z.string().default("."),
  DOOLITTLE_ALLOW_ALL_USERS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DOOLITTLE_PAIRING_MODE: z.enum(["pair", "deny", "allow"]).default("pair"),
  MCP_SERVER_COMMAND: z.string().optional(),
  MCP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  ACP_SERVER_COMMAND: z.string().optional(),
  ACP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DOOLITTLE_RUN_DEPTH: z
    .enum(["quick", "standard", "deep", "explore"])
    .default("standard"),
  DOOLITTLE_TOOL_PROGRESS: z
    .enum(["off", "new", "all", "verbose"])
    .default("new"),
  DOOLITTLE_MAX_ITERATIONS: z.coerce.number().int().positive().default(45),
});

export type ParsedEnvValues = z.infer<typeof envSchema>;

export function parseEnv(env: NodeJS.ProcessEnv): ParsedEnvValues {
  return envSchema.parse(env);
}
