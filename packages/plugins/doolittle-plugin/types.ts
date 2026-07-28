import type { AppServices, EnvConfig } from "@doolittle/agent/plugin-api";

export interface DoolittlePluginDependencies {
  services: AppServices;
  config: EnvConfig;
}

export interface RuntimeModelSettings {
  provider?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
