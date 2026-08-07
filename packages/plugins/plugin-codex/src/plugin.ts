import { createElizaTextGenerationModelHandlers } from "@doolittle/provider-transport";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
import { DEFAULT_CODEX_BASE_URL } from "./constants";
import { runCodexTextGeneration } from "./generate";
import type {
  CodexLiveGenerateParams,
  CodexPluginOptions,
  LinkedAccountStatus,
} from "./types";

export function createCodexPlugin(options: CodexPluginOptions): Plugin {
  class CodexService extends ElizaService {
    static serviceType = "codex";

    capabilityDescription =
      "Linked Codex account bridge for ChatGPT-backed Codex workflows, account-aware inference routing, and operator surfaces.";

    static async start(runtime?: IAgentRuntime): Promise<CodexService> {
      return new CodexService(runtime);
    }

    async stop(): Promise<void> {}

    status(): LinkedAccountStatus {
      return options.getStatus();
    }

    runtimeCredentials() {
      const status = options.getStatus();
      return {
        provider: "codex",
        upstreamProvider: "openai-codex",
        available: status.available,
        reusable: status.reusable,
        baseUrl: DEFAULT_CODEX_BASE_URL,
        authMode: status.authMode ?? "chatgpt",
        source: status.source,
        lastRefresh: status.lastRefresh,
        detail: status.detail,
      };
    }

    async refreshRuntimeCredentials() {
      return options.refreshCredentials?.();
    }

    async generateText(params: CodexLiveGenerateParams): Promise<string> {
      return runCodexTextGeneration(this.runtime, params, options);
    }
  }

  return {
    name: "@doolittle/plugin-codex",
    description:
      "Doolittle-owned Eliza provider bridge for linked Codex accounts and workflow routing.",
    services: [CodexService],
    models: options.enabled
      ? createElizaTextGenerationModelHandlers((runtime, params) =>
          runCodexTextGeneration(runtime, params, options),
        )
      : undefined,
    providers: [],
    actions: [],
    evaluators: [],
    priority: options.enabled ? 100 : 0,
  };
}
