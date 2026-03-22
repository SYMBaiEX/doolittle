import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

interface LinkedAccountStatus {
  provider: string;
  available: boolean;
  reusable: boolean;
  source?: string;
  authMode?: string;
  lastRefresh?: string;
  accountLabel?: string;
  detail: string;
}

interface ClaudeCodePluginOptions {
  getStatus: () => LinkedAccountStatus;
}

export function createClaudeCodePlugin(
  options: ClaudeCodePluginOptions,
): Plugin {
  class ClaudeCodeService extends ElizaService {
    static serviceType = "claude_code";

    capabilityDescription =
      "Linked Claude Code bridge for OAuth-backed Claude workflows, Anthropic-native routing, and operator surfaces.";

    static async start(runtime?: IAgentRuntime): Promise<ClaudeCodeService> {
      return new ClaudeCodeService(runtime);
    }

    async stop(): Promise<void> {}

    status(): LinkedAccountStatus {
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
  }

  return {
    name: "@elizaos/plugin-claude-code",
    description:
      "Workspace-native Claude Code plugin for linked-account discovery and Claude-native workflow routing.",
    services: [ClaudeCodeService],
    providers: [],
    actions: [],
    evaluators: [],
  };
}
