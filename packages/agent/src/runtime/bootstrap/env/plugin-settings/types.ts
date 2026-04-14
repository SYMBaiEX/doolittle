import type {
  getLinkedClaudeCodeCredentials,
  getLinkedCodexCredentials,
  getLinkedElizaCloudCredentials,
} from "@/runtime/native/account-auth";
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

export interface BuildPluginSettingsDependencies {
  env?: NodeJS.ProcessEnv;
  secretSalt?: string;
  pgliteDataDir?: string;
  linkedCredentials?: {
    codex?: ReturnType<typeof getLinkedCodexCredentials>;
    elizaCloud?: ReturnType<typeof getLinkedElizaCloudCredentials>;
    claudeCode?: ReturnType<typeof getLinkedClaudeCodeCredentials>;
  };
}

export type { EnvConfig, RuntimeSettings };
