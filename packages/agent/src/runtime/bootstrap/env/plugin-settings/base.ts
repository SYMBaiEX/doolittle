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
  return {
    featureMap: JSON.stringify(featureMap),
    runtimeSettings: JSON.stringify(runtimeSettings),
    nativeServiceRegistry: JSON.stringify(services.nativeRegistry),
    autonomousAlignment: JSON.stringify(describeAutonomousAlignment(config)),
    ELIZAOS_CLOUD_BASE_URL: config.elizaCloudBaseUrl,
    ELIZAOS_CLOUD_SMALL_MODEL: config.elizaCloudSmallModel,
    ELIZAOS_CLOUD_LARGE_MODEL: config.elizaCloudLargeModel,
    ELIZAOS_CLOUD_EMBEDDING_MODEL: config.elizaCloudEmbeddingModel,
    ELIZAOS_CLOUD_ENABLED: String(
      config.elizaCloudEnabled ||
        runtimeSettings.model.provider === "elizacloud",
    ),
    DOOLITTLE_EMBEDDING_PROVIDER: useCloudEmbeddings ? "elizacloud" : "local",
    OPENAI_BASE_URL: config.openAiBaseUrl,
    OPENAI_SMALL_MODEL: runtimeSettings.model.model,
    OPENAI_LARGE_MODEL: runtimeSettings.model.model,
    ANTHROPIC_SMALL_MODEL: config.anthropicSmallModel,
    ANTHROPIC_LARGE_MODEL: config.anthropicLargeModel,
    SECRET_SALT:
      dependencies.secretSalt ??
      env.SECRET_SALT?.trim() ??
      ensureSecretSalt(config),
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
