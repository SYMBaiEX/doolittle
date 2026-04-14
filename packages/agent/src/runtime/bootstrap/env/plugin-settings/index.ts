import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";
import { applyAmbientProcessSettings } from "./ambient";
import { buildBaseSettings } from "./base";
import { applyEmbeddingSettings } from "./embedding";
import { applyLinkedProviderSettings } from "./linked-provider";
import { applyOptionalProviderSettings } from "./optional-providers";
import type {
  BuildPluginSettingsDependencies,
  PluginSettings,
  RuntimeSettings,
} from "./types";

export function buildPluginSettings(
  config: EnvConfig,
  services: AppServices,
  runtimeSettings: RuntimeSettings,
  dependencies: BuildPluginSettingsDependencies = {},
): PluginSettings {
  const env = dependencies.env ?? process.env;
  const settings = buildBaseSettings(
    config,
    services,
    runtimeSettings,
    env,
    dependencies,
  );
  applyLinkedProviderSettings(settings, config, runtimeSettings, dependencies);
  applyEmbeddingSettings(settings, config, env);
  applyOptionalProviderSettings(settings, config);
  applyAmbientProcessSettings(settings, env);
  return settings;
}

export type { BuildPluginSettingsDependencies, PluginSettings };
