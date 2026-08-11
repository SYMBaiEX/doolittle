import { createElizaTextGenerationModelHandlers } from "@doolittle/provider-transport";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
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
      "Structured local Claude CLI fallback for environments without reusable OAuth credentials.";

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
        fallbackReady: status.fallbackReady ?? false,
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
    name: "@doolittle/plugin-claude-code",
    description:
      "Narrow structured Claude CLI fallback behind the official Eliza Anthropic provider.",
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
