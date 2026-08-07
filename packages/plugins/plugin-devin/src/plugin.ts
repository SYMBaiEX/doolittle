import { createElizaTextGenerationModelHandlers } from "@doolittle/provider-transport";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
import {
  DEFAULT_DEVIN_COMMAND,
  DEFAULT_DEVIN_MODEL,
  DEFAULT_DEVIN_TIMEOUT_MS,
} from "./cli";
import { runDevinTextGeneration } from "./generate";
import type { DevinLiveGenerateParams, DevinPluginOptions } from "./types";

export function createDevinPlugin(options: DevinPluginOptions): Plugin {
  class DevinService extends ElizaService {
    static serviceType = "devin";

    capabilityDescription =
      "Linked Devin CLI bridge for SWE model execution through local Devin credentials and non-interactive print mode.";

    static async start(runtime?: IAgentRuntime): Promise<DevinService> {
      return new DevinService(runtime);
    }

    async stop(): Promise<void> {}

    status() {
      return options.getStatus();
    }

    runtimeCredentials() {
      const status = options.getStatus();
      return {
        provider: "devin",
        upstreamProvider: "devin-cli",
        available: status.available,
        reusable: status.reusable,
        nativeReady: status.nativeReady,
        model: options.model || DEFAULT_DEVIN_MODEL,
        command: options.command || DEFAULT_DEVIN_COMMAND,
        timeoutMs: options.timeoutMs ?? DEFAULT_DEVIN_TIMEOUT_MS,
        authMode: status.authMode ?? "cli",
        source: status.source,
        accountLabel: status.accountLabel,
        detail: status.detail,
      };
    }

    async generateText(params: DevinLiveGenerateParams): Promise<string> {
      return runDevinTextGeneration(this.runtime, params, options);
    }
  }

  return {
    name: "@doolittle/plugin-devin",
    description:
      "Doolittle-owned Eliza provider bridge for linked Devin CLI accounts and SWE model routing.",
    services: [DevinService],
    models: options.enabled
      ? createElizaTextGenerationModelHandlers((runtime, params) =>
          runDevinTextGeneration(runtime, params, options),
        )
      : undefined,
    providers: [],
    actions: [],
    evaluators: [],
    priority: options.enabled ? 100 : 0,
  };
}
