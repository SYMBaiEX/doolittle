import type { GenerateTextParams, IAgentRuntime } from "@elizaos/core";
import {
  createProviderHttpError,
  getRuntimeModelSettings,
  getRuntimeProvider,
  normalizeProviderTransportError,
  ProviderTransportError,
  resolveModelPromptText,
} from "@elizaos/provider-transport";
import {
  CLAUDE_CODE_VERSION,
  invokeClaudeCodeCliPrint,
  withClaudeCodeSystemPrefix,
} from "./cli";
import {
  CLAUDE_CODE_ANTHROPIC_VERSION,
  CLAUDE_CODE_CLI_INFERENCE_SYSTEM_PROMPT,
  COMMON_BETAS,
  DEFAULT_ANTHROPIC_BASE_URL,
  OAUTH_ONLY_BETAS,
} from "./constants";
import type { ClaudeCodePluginOptions } from "./types";

const CLAUDE_REASONING_EFFORTS = new Set([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
const CLAUDE_REQUEST_TIMEOUT_MS = 120_000;

function claudeRequestSignal(params: GenerateTextParams): AbortSignal {
  const callerSignal = (params as GenerateTextParams & { signal?: AbortSignal })
    .signal;
  const timeoutSignal = AbortSignal.timeout(CLAUDE_REQUEST_TIMEOUT_MS);
  return callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;
}

function resolveClaudeReasoningEffort(
  value: string | undefined,
): string | undefined {
  const effort = value?.trim();
  return effort && CLAUDE_REASONING_EFFORTS.has(effort) ? effort : undefined;
}

function resolveClaudeCliModel(model: string): string {
  const normalized = model.trim().toLowerCase();
  if (normalized.includes("sonnet")) return "sonnet";
  if (normalized.includes("opus")) return "opus";
  if (normalized.includes("haiku")) return "haiku";
  return model;
}

function credentialsAreExpired(credentials: { expiresAt?: string }): boolean {
  if (!credentials.expiresAt) {
    return false;
  }
  const expiresAt = Number(credentials.expiresAt);
  return Number.isFinite(expiresAt) && Date.now() >= expiresAt;
}

function anthropicHeaders(accessToken: string): {
  Authorization: string;
  "Content-Type": string;
  "anthropic-version": string;
  "anthropic-beta": string;
  "user-agent": string;
  "x-app": string;
} {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "anthropic-version": CLAUDE_CODE_ANTHROPIC_VERSION,
    "anthropic-beta": [...COMMON_BETAS, ...OAUTH_ONLY_BETAS].join(","),
    "user-agent": `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`,
    "x-app": "cli",
  };
}

export async function runClaudeCodeTextGeneration(
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  options: ClaudeCodePluginOptions,
): Promise<string> {
  const provider = getRuntimeProvider(runtime);
  if (provider && provider !== "claude-code") {
    throw new ProviderTransportError(
      `Claude Code model handler is active, but runtime provider is ${provider}. Restart with the Claude Code provider selected to use this plugin directly.`,
      {
        code: "incompatible_provider",
        provider: "claude-code",
        detail: provider,
      },
    );
  }

  const runtimeModel = getRuntimeModelSettings(runtime);
  const model = runtimeModel.model || "claude-sonnet-4.6";
  const effort = resolveClaudeReasoningEffort(runtimeModel.reasoningEffort);
  const promptText = resolveModelPromptText(params);
  const requiredSingleTool =
    params.toolChoice !== "none" && params.tools?.length === 1
      ? params.tools[0]
      : undefined;
  const invokeCliFallback = async (): Promise<string> => {
    try {
      const cliOutput = await (
        options.invokeCliPrint ?? invokeClaudeCodeCliPrint
      )({
        prompt: promptText,
        // Claude CLI aliases follow the newest model available to the signed-in
        // account. They also avoid coupling fallback execution to retired API
        // snapshot IDs retained in existing conversations.
        model: resolveClaudeCliModel(model),
        systemPrompt: CLAUDE_CODE_CLI_INFERENCE_SYSTEM_PROMPT,
        ...(effort ? { effort } : {}),
        ...(requiredSingleTool?.parameters
          ? {
              jsonSchema: requiredSingleTool.parameters as Record<
                string,
                unknown
              >,
            }
          : {}),
      });
      return cliOutput || "No response returned.";
    } catch (error) {
      throw normalizeProviderTransportError(
        "claude-code",
        "CLI request",
        error,
      );
    }
  };
  const refreshCredentials = async () => {
    try {
      return await options.refreshCredentials?.();
    } catch (error) {
      if (!options.allowCliFallback) {
        throw normalizeProviderTransportError(
          "claude-code",
          "credential refresh",
          error,
        );
      }
      return undefined;
    }
  };

  // Claude Code's CLI owns a native JSON-schema path that maps Eliza's
  // single required response-handler tool into validated structured output.
  // Prefer it over the raw OAuth endpoint for these lifecycle calls: the API
  // response parser below intentionally handles text responses only.
  if (options.allowCliFallback && requiredSingleTool?.parameters) {
    try {
      return await invokeCliFallback();
    } catch {
      // A linked token may still be usable when the CLI executable itself is
      // unavailable, so continue into the direct OAuth transport.
    }
  }

  let credentials = options.getCredentials?.();
  if (
    (!credentials?.accessToken?.trim() || credentialsAreExpired(credentials)) &&
    options.refreshCredentials
  ) {
    credentials = await refreshCredentials();
  }
  const accessToken = credentials?.accessToken?.trim();

  if (!accessToken) {
    if (!options.allowCliFallback) {
      throw new ProviderTransportError(
        "No reusable Claude Code auth material is available for native execution. Complete `claude auth login` plus `claude setup-token`, or enable the local Claude CLI fallback explicitly.",
        {
          code: "no_credentials",
          provider: "claude-code",
        },
      );
    }
    return invokeCliFallback();
  }

  const endpoint = `${runtimeModel.baseUrl || DEFAULT_ANTHROPIC_BASE_URL}/v1/messages`;
  const requestBody = {
    model,
    max_tokens: params.maxTokens ?? runtimeModel.maxTokens ?? 1200,
    temperature: runtimeModel.temperature ?? 0.4,
    ...(effort ? { output_config: { effort } } : {}),
    system: withClaudeCodeSystemPrefix(),
    messages: [
      {
        role: "user",
        content: promptText,
      },
    ],
  };
  const signal = claudeRequestSignal(params);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: anthropicHeaders(accessToken),
      body: JSON.stringify(requestBody),
      signal,
    });
  } catch (error) {
    if (options.allowCliFallback) {
      return invokeCliFallback();
    }
    throw normalizeProviderTransportError(
      "claude-code",
      "messages request",
      error,
    );
  }

  if (
    (response.status === 401 || response.status === 403) &&
    options.refreshCredentials
  ) {
    const refreshed = await refreshCredentials();
    const refreshedAccessToken = refreshed?.accessToken?.trim();
    if (refreshedAccessToken && refreshedAccessToken !== accessToken) {
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: anthropicHeaders(refreshedAccessToken),
          body: JSON.stringify(requestBody),
          signal,
        });
      } catch (error) {
        if (options.allowCliFallback) {
          return invokeCliFallback();
        }
        throw normalizeProviderTransportError(
          "claude-code",
          "messages refresh request",
          error,
        );
      }
    } else if (options.allowCliFallback) {
      return invokeCliFallback();
    }
  }

  if (!response.ok) {
    const body = await response.text();
    if (options.allowCliFallback) {
      return invokeCliFallback();
    }
    throw createProviderHttpError({
      provider: "claude-code",
      operation: "messages request",
      status: response.status,
      detail: body,
    });
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
