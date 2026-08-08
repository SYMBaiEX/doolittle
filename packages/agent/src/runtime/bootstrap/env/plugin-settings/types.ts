import type { JsonValue } from "@elizaos/core";
import type {
  getLinkedClaudeCodeCredentials,
  getLinkedElizaCloudCredentials,
} from "@/runtime/native/account-auth";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";

type RuntimeSettings = ReturnType<AppServices["settings"]["get"]>;

export interface PluginSettings {
  mcp: JsonValue;
  featureMap: string;
  runtimeSettings: string;
  nativeServiceRegistry: string;
  autonomousAlignment: string;
  SKILLS_DIR: string;
  WORKSPACE_SKILLS_DIR: string;
  BUNDLED_SKILLS_DIRS: string;
  SKILLS_AUTO_LOAD: string;
  SKILLS_SYNC_CATALOG_ON_START: string;
  ELIZAOS_CLOUD_BASE_URL: string;
  ELIZAOS_CLOUD_SMALL_MODEL: string;
  ELIZAOS_CLOUD_LARGE_MODEL: string;
  ELIZAOS_CLOUD_EMBEDDING_MODEL: string;
  ELIZAOS_CLOUD_ENABLED: string;
  DOOLITTLE_EMBEDDING_PROVIDER: string;
  OLLAMA_API_ENDPOINT: string;
  OLLAMA_SMALL_MODEL: string;
  OLLAMA_MEDIUM_MODEL: string;
  OLLAMA_LARGE_MODEL: string;
  OLLAMA_RESPONSE_HANDLER_MODEL: string;
  OLLAMA_ACTION_PLANNER_MODEL: string;
  OLLAMA_EMBEDDING_MODEL: string;
  DEVIN_CLI_COMMAND: string;
  DEVIN_MODEL: string;
  DEVIN_TIMEOUT_MS: string;
  SMALL_MODEL: string;
  LARGE_MODEL: string;
  OPENAI_BASE_URL: string;
  OPENAI_SMALL_MODEL: string;
  OPENAI_LARGE_MODEL: string;
  OPENAI_IMAGE_MODEL?: string;
  CODEX_BASE_URL?: string;
  CODEX_MODEL?: string;
  ANTHROPIC_SMALL_MODEL: string;
  ANTHROPIC_LARGE_MODEL: string;
  SECRET_SALT: string;
  ENCRYPTION_SALT: string;
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
  OPENAI_REASONING_EFFORT?: "minimal" | "low" | "medium" | "high";
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  E2B_API_KEY?: string;
  GITHUB_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_API_ROOT?: string;
  TELEGRAM_ALLOWED_CHATS?: string;
  DISCORD_API_TOKEN?: string;
  DISCORD_APPLICATION_ID?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_APP_TOKEN?: string;
  SLACK_SIGNING_SECRET?: string;
  SLACK_USER_TOKEN?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string;
  WHATSAPP_AUTH_METHOD?: "cloudapi" | "baileys";
  WHATSAPP_APP_SECRET?: string;
  SIGNAL_ACCOUNT_NUMBER?: string;
  SIGNAL_HTTP_URL?: string;
  SIGNAL_CLI_PATH?: string;
}

export interface BuildPluginSettingsDependencies {
  env?: NodeJS.ProcessEnv;
  secretSalt?: string;
  pgliteDataDir?: string;
  linkedCredentials?: {
    elizaCloud?: ReturnType<typeof getLinkedElizaCloudCredentials>;
    claudeCode?: ReturnType<typeof getLinkedClaudeCodeCredentials>;
  };
}

export type { EnvConfig, RuntimeSettings };
