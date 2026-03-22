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

interface CodexPluginOptions {
  getStatus: () => LinkedAccountStatus;
}

const DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";

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
  }

  return {
    name: "@elizaos/plugin-codex",
    description:
      "Workspace-native Codex plugin for linked-account discovery and Codex-native workflow routing.",
    services: [CodexService],
    providers: [],
    actions: [],
    evaluators: [],
  };
}
