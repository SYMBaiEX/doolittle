import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
import { createElizaTextGenerationModelHandlers } from "@elizaos/provider-transport";
import { runClaudeCodeTextGeneration } from "./anthropic";
import type {
  ClaudeCodeLiveGenerateParams,
  ClaudeCodePluginOptions,
} from "./types";

export function createClaudeCodePlugin(
  options: ClaudeCodePluginOptions,
): Plugin {
  class ClaudeCodeService extends ElizaService {
    static serviceType = "claude_code";

    capabilityDescription =
      "Linked Claude Code bridge for native Claude workflows, Anthropic-native routing, and optional local CLI fallback.";

    static async start(runtime?: IAgentRuntime): Promise<ClaudeCodeService> {
      return new ClaudeCodeService(runtime);
    }

    async stop(): Promise<void> {}

    status() {
      return options.getStatus();
    }

    runtimeCredentials() {
      const status = options.getStatus();
      return {
        provider: "claude-code",
        upstreamProvider: "anthropic",
        available: status.available,
        reusable: status.reusable,
        authMode: status.authMode ?? "oauth",
        source: status.source,
        lastRefresh: status.lastRefresh,
        accountLabel: status.accountLabel,
        detail: status.detail,
      };
    }

    async refreshRuntimeCredentials() {
      return options.refreshCredentials?.();
    }

    async generateText(params: ClaudeCodeLiveGenerateParams): Promise<string> {
      return runClaudeCodeTextGeneration(this.runtime, params, options);
    }
  }

  return {
    name: "@elizaos/plugin-claude-code",
    description:
      "Doolittle-owned Eliza provider bridge for linked Claude Code accounts and workflow routing.",
    services: [ClaudeCodeService],
    models: options.enabled
      ? createElizaTextGenerationModelHandlers((runtime, params) =>
          runClaudeCodeTextGeneration(runtime, params, options),
        )
      : undefined,
    providers: [],
    actions: [],
    evaluators: [],
    priority: options.enabled ? 100 : 0,
  };
}
