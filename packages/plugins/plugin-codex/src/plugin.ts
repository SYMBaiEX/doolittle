import {
  Service as ElizaService,
  type IAgentRuntime,
  ModelType,
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
    name: "@elizaos/plugin-codex",
    description:
      "Workspace-native Codex plugin for linked-account discovery and Codex-native workflow routing.",
    services: [CodexService],
    models: options.enabled
      ? {
          [ModelType.TEXT_SMALL]: (runtime, params) =>
            runCodexTextGeneration(runtime, params, options),
          [ModelType.TEXT_LARGE]: (runtime, params) =>
            runCodexTextGeneration(runtime, params, options),
          [ModelType.TEXT_REASONING_SMALL]: (runtime, params) =>
            runCodexTextGeneration(runtime, params, options),
          [ModelType.TEXT_REASONING_LARGE]: (runtime, params) =>
            runCodexTextGeneration(runtime, params, options),
          [ModelType.TEXT_COMPLETION]: (runtime, params) =>
            runCodexTextGeneration(runtime, params, options),
        }
      : undefined,
    providers: [],
    actions: [],
    evaluators: [],
    priority: options.enabled ? 100 : 0,
  };
}
