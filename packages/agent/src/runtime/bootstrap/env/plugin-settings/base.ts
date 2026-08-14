import { homedir } from "node:os";
import { join } from "node:path";
import type { JsonValue } from "@elizaos/core";
import { getSkillsDir } from "@elizaos/skills/index";
import { featureMap } from "@/config/feature-map";
import { getPgliteDataDir } from "@/runtime/bootstrap/env/pglite";
import { ensureSecretSalt } from "@/runtime/bootstrap/env/secret-salt";
import { describeAutonomousAlignment } from "@/runtime/native/autonomous-stack";
import type { AppServices } from "@/services";
import { shouldUseCloudEmbeddings } from "./embedding";
import type {
  BuildPluginSettingsDependencies,
  EnvConfig,
  PluginSettings,
  RuntimeSettings,
} from "./types";

export function buildBaseSettings(
  config: EnvConfig,
  services: AppServices,
  runtimeSettings: RuntimeSettings,
  env: NodeJS.ProcessEnv,
  dependencies: BuildPluginSettingsDependencies,
): PluginSettings {
  const useCloudEmbeddings = shouldUseCloudEmbeddings(config, env);
  const ollamaRouteSelected = runtimeSettings.model.provider === "ollama";
  const selectedOllamaModel = runtimeSettings.model.model.trim();
  const ollamaModel = ollamaRouteSelected
    ? selectedOllamaModel || config.ollamaLargeModel
    : config.ollamaLargeModel;
  const ollamaSmallModel = ollamaRouteSelected
    ? selectedOllamaModel || config.ollamaSmallModel
    : config.ollamaSmallModel;
  const ollamaEndpoint = ollamaRouteSelected
    ? runtimeSettings.model.baseUrl || config.ollamaApiEndpoint
    : config.ollamaApiEndpoint;
  const reasoningEffort = runtimeSettings.model.reasoningEffort;
  const openAiReasoningEffort =
    runtimeSettings.model.provider === "openai" &&
    (reasoningEffort === "minimal" ||
      reasoningEffort === "low" ||
      reasoningEffort === "medium" ||
      reasoningEffort === "high")
      ? reasoningEffort
      : undefined;
  const secretSalt =
    dependencies.secretSalt ??
    env.SECRET_SALT?.trim() ??
    env.ENCRYPTION_SALT?.trim() ??
    ensureSecretSalt(config);
  return {
    mcp: runtimeSettings.mcp as unknown as JsonValue,
    featureMap: JSON.stringify(featureMap),
    runtimeSettings: JSON.stringify(runtimeSettings),
    nativeServiceRegistry: JSON.stringify(services.nativeRegistry),
    autonomousAlignment: JSON.stringify(describeAutonomousAlignment(config)),
    SKILLS_DIR: env.SKILLS_DIR?.trim() || join(homedir(), ".elizaos", "skills"),
    WORKSPACE_SKILLS_DIR: env.WORKSPACE_SKILLS_DIR?.trim() || config.skillsDir,
    BUNDLED_SKILLS_DIRS: env.BUNDLED_SKILLS_DIRS?.trim() || getSkillsDir(),
    SKILLS_AUTO_LOAD: "true",
    SKILLS_SYNC_CATALOG_ON_START:
      env.SKILLS_SYNC_CATALOG_ON_START?.trim() || "false",
    ELIZAOS_CLOUD_BASE_URL: config.elizaCloudBaseUrl,
    ELIZAOS_CLOUD_SMALL_MODEL: config.elizaCloudSmallModel,
    ELIZAOS_CLOUD_LARGE_MODEL: config.elizaCloudLargeModel,
    ELIZAOS_CLOUD_EMBEDDING_MODEL: config.elizaCloudEmbeddingModel,
    ELIZAOS_CLOUD_ENABLED: String(
      config.elizaCloudEnabled ||
        runtimeSettings.model.provider === "elizacloud",
    ),
    DOOLITTLE_EMBEDDING_PROVIDER: useCloudEmbeddings ? "elizacloud" : "local",
    // The persisted route is the source of truth after first-run setup. The
    // config values remain the bootstrap defaults, but must not overwrite a
    // model selected in Settings when the runtime is rebuilt.
    OLLAMA_API_ENDPOINT: ollamaEndpoint,
    OLLAMA_SMALL_MODEL: ollamaSmallModel,
    OLLAMA_MEDIUM_MODEL: ollamaSmallModel,
    OLLAMA_LARGE_MODEL: ollamaModel,
    OLLAMA_RESPONSE_HANDLER_MODEL: ollamaSmallModel,
    OLLAMA_ACTION_PLANNER_MODEL: ollamaModel,
    OLLAMA_EMBEDDING_MODEL: config.ollamaEmbeddingModel,
    DEVIN_CLI_COMMAND: config.devinCliCommand,
    DEVIN_MODEL: config.devinModel,
    DEVIN_TIMEOUT_MS: String(config.devinTimeoutMs),
    SMALL_MODEL: ollamaSmallModel,
    LARGE_MODEL: ollamaModel,
    OPENAI_BASE_URL: config.openAiBaseUrl,
    OPENAI_SMALL_MODEL: runtimeSettings.model.model,
    OPENAI_LARGE_MODEL: runtimeSettings.model.model,
    ...(config.openAiImageModel
      ? { OPENAI_IMAGE_MODEL: config.openAiImageModel }
      : {}),
    ...(openAiReasoningEffort
      ? { OPENAI_REASONING_EFFORT: openAiReasoningEffort }
      : {}),
    ANTHROPIC_SMALL_MODEL: config.anthropicSmallModel,
    ANTHROPIC_LARGE_MODEL: config.anthropicLargeModel,
    SECRET_SALT: secretSalt,
    ENCRYPTION_SALT: env.ENCRYPTION_SALT?.trim() ?? secretSalt,
    PGLITE_DATA_DIR:
      dependencies.pgliteDataDir ?? getPgliteDataDir(config, env),
    USE_MULTI_STEP: "true",
    MAX_MULTISTEP_ITERATIONS: String(runtimeSettings.agent.maxIterations),
    DOOLITTLE_RUN_DEPTH: runtimeSettings.agent.runDepth,
    DOOLITTLE_TOOL_PROGRESS: runtimeSettings.agent.toolProgressMode,
    E2B_MODE: env.E2B_MODE ?? "local",
    NODE_ENV: env.NODE_ENV ?? "development",
  };
}
