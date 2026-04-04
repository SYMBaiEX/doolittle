import type { AgentRuntime, IAgentRuntime, Plugin } from "@elizaos/core";
import type { GatewayRunner } from "@/gateway/runner";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";

export interface AppContext {
  config: EnvConfig;
  services: AppServices;
  runtime: IAgentRuntime;
  gateway: GatewayRunner;
  ensureDeferredHydration(reason?: string): Promise<void>;
}

export interface AppContextOptions {
  startupMode?: "cli" | "api" | "worker";
  eagerDeferredHydration?: boolean;
}

export interface BootstrapContext extends Omit<AppContext, "runtime"> {
  runtime: AgentRuntime;
}

export interface BootstrapContextParams {
  config: EnvConfig;
  services: AppServices;
  runtime: AgentRuntime;
  eagerDeferredHydration: boolean;
  startupMode?: "cli" | "api" | "worker";
  loadDeferredPlugins(): Promise<Plugin[]>;
}

export interface AppContextBuildOptions {
  startupMode?: "cli" | "api" | "worker";
  eagerDeferredHydration: boolean;
}
