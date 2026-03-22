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

interface CodexAuthPluginOptions {
  getStatus: () => LinkedAccountStatus;
}

const DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";

export function createCodexAuthPlugin(options: CodexAuthPluginOptions): Plugin {
  class CodexAccountAuthService extends ElizaService {
    static serviceType = "codex_account_auth";

    capabilityDescription =
      "Linked Codex account bridge for ChatGPT-backed Codex workflows and account-aware operator surfaces.";

    static async start(
      runtime?: IAgentRuntime,
    ): Promise<CodexAccountAuthService> {
      return new CodexAccountAuthService(runtime);
    }

    async stop(): Promise<void> {}

    status(): LinkedAccountStatus {
      return options.getStatus();
    }

    runtimeCredentials() {
      const status = options.getStatus();
      return {
        provider: "openai-codex",
        available: status.available,
        reusable: status.reusable,
        baseUrl: DEFAULT_CODEX_BASE_URL,
        authMode: status.authMode ?? "chatgpt",
        source: status.source,
        lastRefresh: status.lastRefresh,
        detail: status.detail,
      };
    }
  }

  return {
    name: "@elizaos/plugin-codex-auth",
    description:
      "Workspace-native linked Codex account bridge for account-aware provider flows.",
    services: [CodexAccountAuthService],
    providers: [],
    actions: [],
    evaluators: [],
  };
}
