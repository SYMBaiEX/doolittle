import type { BotDefinition } from "@doolittle/contracts/bots";
import type { AgentRuntime, IAgentRuntime, Plugin } from "@elizaos/core";
import type { GatewayRunner } from "../../gateway/runner/index";
import type { AppServices } from "../../services/index";
import type { EnvConfig } from "../../types/runtime/index";

export interface AppContext {
  config: EnvConfig;
  services: AppServices;
  runtime: IAgentRuntime;
  gateway: GatewayRunner;
  ensureTurnPlugins(signal?: AbortSignal): Promise<void>;
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
  loadTurnPlugins(): Promise<Plugin[]>;
  loadMessagingPlugins(): Promise<Plugin[]>;
  bindRuntime(runtime: IAgentRuntime): void;
  workerBot: BotDefinition | null;
}
