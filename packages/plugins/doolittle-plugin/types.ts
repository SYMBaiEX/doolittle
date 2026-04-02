import type { AppServices, EnvConfig } from "@doolittle/agent/plugin-api";

export interface DoolittlePluginDependencies {
  services: AppServices;
  config: EnvConfig;
}

export interface RuntimeModelSettings {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
