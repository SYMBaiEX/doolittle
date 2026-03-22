import {
  Service as ElizaService,
  type GenerateTextParams,
  type IAgentRuntime,
  ModelType,
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
  enabled?: boolean;
  getStatus: () => LinkedAccountStatus;
  getCredentials?: () =>
    | {
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: string;
        accountLabel?: string;
        source?: string;
      }
    | undefined;
}

const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const COMMON_BETAS = [
  "interleaved-thinking-2025-05-14",
  "fine-grained-tool-streaming-2025-05-14",
];
const OAUTH_ONLY_BETAS = ["claude-code-20250219", "oauth-2025-04-20"];
const CLAUDE_CODE_VERSION = "2.1.74";

function getRuntimeProvider(
  runtime: IAgentRuntime | undefined,
): string | undefined {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return undefined;
    }
    const parsed = JSON.parse(raw) as {
      model?: { provider?: string };
    };
    return parsed.model?.provider;
  } catch {
    return undefined;
  }
}

function getRuntimeModelSettings(runtime: IAgentRuntime | undefined): {
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
} {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return {};
    }
    const parsed = JSON.parse(raw) as {
      model?: {
        model?: string;
        baseUrl?: string;
        temperature?: number;
        maxTokens?: number;
      };
    };
    return parsed.model ?? {};
  } catch {
    return {};
  }
}

async function runClaudeCodeTextGeneration(
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  options: ClaudeCodePluginOptions,
): Promise<string> {
  const provider = getRuntimeProvider(runtime);
  if (provider && provider !== "claude-code") {
    throw new Error(
      `Claude Code model handler is active, but runtime provider is ${provider}. Restart with the Claude Code provider selected to use this plugin directly.`,
    );
  }

  const credentials = options.getCredentials?.();
  const accessToken = credentials?.accessToken?.trim();
  if (!accessToken) {
    throw new Error(
      "No reusable linked Claude Code access token is available for the Claude Code provider.",
    );
  }

  const runtimeModel = getRuntimeModelSettings(runtime);
  const response = await fetch(
    `${runtimeModel.baseUrl || DEFAULT_ANTHROPIC_BASE_URL}/v1/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": [...COMMON_BETAS, ...OAUTH_ONLY_BETAS].join(","),
        "user-agent": `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`,
        "x-app": "cli",
      },
      body: JSON.stringify({
        model: runtimeModel.model || "claude-sonnet-4-20250514",
        max_tokens: params.maxTokens ?? runtimeModel.maxTokens ?? 1200,
        temperature: runtimeModel.temperature ?? 0.4,
        messages: [
          {
            role: "user",
            content: params.prompt,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude Code request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const text = data.content
    ?.filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("")
    .trim();

  return text || "No response returned.";
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
    models: options.enabled
      ? {
          [ModelType.TEXT_SMALL]: (runtime, params) =>
            runClaudeCodeTextGeneration(runtime, params, options),
          [ModelType.TEXT_LARGE]: (runtime, params) =>
            runClaudeCodeTextGeneration(runtime, params, options),
          [ModelType.TEXT_REASONING_SMALL]: (runtime, params) =>
            runClaudeCodeTextGeneration(runtime, params, options),
          [ModelType.TEXT_REASONING_LARGE]: (runtime, params) =>
            runClaudeCodeTextGeneration(runtime, params, options),
          [ModelType.TEXT_COMPLETION]: (runtime, params) =>
            runClaudeCodeTextGeneration(runtime, params, options),
        }
      : undefined,
    providers: [],
    actions: [],
    evaluators: [],
    priority: options.enabled ? 100 : 0,
  };
}
