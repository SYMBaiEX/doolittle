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

interface ClaudeCodeAuthPluginOptions {
  getStatus: () => LinkedAccountStatus;
}

export function createClaudeCodeAuthPlugin(
  options: ClaudeCodeAuthPluginOptions,
): Plugin {
  class ClaudeCodeAuthService extends ElizaService {
    static serviceType = "claude_code_auth";

    capabilityDescription =
      "Linked Claude Code account bridge for OAuth-backed Anthropic-native workflows and operator surfaces.";

    static async start(
      runtime?: IAgentRuntime,
    ): Promise<ClaudeCodeAuthService> {
      return new ClaudeCodeAuthService(runtime);
    }

    async stop(): Promise<void> {}

    status(): LinkedAccountStatus {
      return options.getStatus();
    }

    runtimeCredentials() {
      const status = options.getStatus();
      return {
        provider: "claude-code",
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
    name: "@elizaos/plugin-claude-code-auth",
    description:
      "Workspace-native linked Claude Code account bridge for account-aware provider flows.",
    services: [ClaudeCodeAuthService],
    providers: [],
    actions: [],
    evaluators: [],
  };
}
