import { spawnSync } from "node:child_process";
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
  allowCliFallback?: boolean;
  getStatus: () => LinkedAccountStatus;
  invokeCliPrint?: (params: {
    prompt: string;
    model: string;
    appendSystemPrompt?: string;
  }) => Promise<string>;
  getCredentials?: () =>
    | {
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: string;
        accountLabel?: string;
        source?: string;
      }
    | undefined;
  refreshCredentials?: () => Promise<
    | {
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: string;
        accountLabel?: string;
        source?: string;
      }
    | undefined
  >;
}

export interface ClaudeCodeLiveGenerateParams {
  prompt: string;
  maxTokens?: number;
}

const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const COMMON_BETAS = [
  "interleaved-thinking-2025-05-14",
  "fine-grained-tool-streaming-2025-05-14",
];
const OAUTH_ONLY_BETAS = ["claude-code-20250219", "oauth-2025-04-20"];
const CLAUDE_CODE_VERSION_FALLBACK = "2.1.74";
const CLAUDE_CODE_SYSTEM_PREFIX =
  "You are Claude Code, Anthropic's official CLI for Claude.";

function getClaudeCodeVersion(): string {
  for (const command of ["claude", "claude-code"]) {
    try {
      const result = spawnSync(command, ["--version"], {
        encoding: "utf8",
        timeout: 5000,
      });
      const version = result.stdout?.trim().split(/\s+/)[0];
      if (result.status === 0 && version && /^\d/.test(version)) {
        return version;
      }
    } catch {}
  }
  return CLAUDE_CODE_VERSION_FALLBACK;
}

const CLAUDE_CODE_VERSION = getClaudeCodeVersion();

function withClaudeCodeSystemPrefix(): Array<{ type: "text"; text: string }> {
  return [
    {
      type: "text",
      text: CLAUDE_CODE_SYSTEM_PREFIX,
    },
  ];
}

async function invokeClaudeCodeCliPrint(params: {
  prompt: string;
  model: string;
  appendSystemPrompt?: string;
}): Promise<string> {
  const args = [
    "-p",
    params.prompt,
    "--output-format",
    "text",
    "--model",
    params.model,
  ];

  if (params.appendSystemPrompt?.trim()) {
    args.push("--append-system-prompt", params.appendSystemPrompt.trim());
  }

  const result = spawnSync("claude", args, {
    encoding: "utf8",
    timeout: 120_000,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      `Claude Code CLI invocation failed${typeof result.status === "number" ? ` (${result.status})` : ""}: ${detail || "Unknown error"}`,
    );
  }

  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

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

  let credentials = options.getCredentials?.();
  if (!credentials?.accessToken?.trim() && options.refreshCredentials) {
    credentials = await options.refreshCredentials();
  }
  const accessToken = credentials?.accessToken?.trim();
  const runtimeModel = getRuntimeModelSettings(runtime);
  const model = runtimeModel.model || "claude-sonnet-4.6";

  if (!accessToken) {
    if (!options.allowCliFallback) {
      throw new Error(
        "No reusable Claude Code auth material is available for native execution. Complete `claude auth login` plus `claude setup-token`, or enable the local Claude CLI fallback explicitly.",
      );
    }
    const cliOutput = await (
      options.invokeCliPrint ?? invokeClaudeCodeCliPrint
    )({
      prompt: params.prompt,
      model,
      appendSystemPrompt: CLAUDE_CODE_SYSTEM_PREFIX,
    });
    return cliOutput || "No response returned.";
  }

  const endpoint = `${runtimeModel.baseUrl || DEFAULT_ANTHROPIC_BASE_URL}/v1/messages`;
  const requestBody = {
    model,
    max_tokens: params.maxTokens ?? runtimeModel.maxTokens ?? 1200,
    temperature: runtimeModel.temperature ?? 0.4,
    system: withClaudeCodeSystemPrefix(),
    messages: [
      {
        role: "user",
        content: params.prompt,
      },
    ],
  };
  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": [...COMMON_BETAS, ...OAUTH_ONLY_BETAS].join(","),
      "user-agent": `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`,
      "x-app": "cli",
    },
    body: JSON.stringify(requestBody),
  });

  if (
    (response.status === 401 || response.status === 403) &&
    options.refreshCredentials
  ) {
    const refreshed = await options.refreshCredentials();
    const refreshedAccessToken = refreshed?.accessToken?.trim();
    if (refreshedAccessToken && refreshedAccessToken !== accessToken) {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${refreshedAccessToken}`,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": [...COMMON_BETAS, ...OAUTH_ONLY_BETAS].join(","),
          "user-agent": `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`,
          "x-app": "cli",
        },
        body: JSON.stringify(requestBody),
      });
    }
  }

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
      "Linked Claude Code bridge for native Claude workflows, Anthropic-native routing, and optional local CLI fallback.";

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
