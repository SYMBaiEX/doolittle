import type { GenerateTextParams, IAgentRuntime } from "@elizaos/core";
import {
  CLAUDE_CODE_VERSION,
  invokeClaudeCodeCliPrint,
  withClaudeCodeSystemPrefix,
} from "./cli";
import {
  CLAUDE_CODE_ANTHROPIC_VERSION,
  COMMON_BETAS,
  DEFAULT_ANTHROPIC_BASE_URL,
  OAUTH_ONLY_BETAS,
} from "./constants";
import { resolveModelPromptText } from "./prompt-text";
import {
  getRuntimeModelSettings,
  getRuntimeProvider,
} from "./runtime-settings";
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
    throw new Error(
      `Claude Code model handler is active, but runtime provider is ${provider}. Restart with the Claude Code provider selected to use this plugin directly.`,
    );
  }

  const runtimeModel = getRuntimeModelSettings(runtime);
  const model = runtimeModel.model || "claude-sonnet-4.6";
  const effort = resolveClaudeReasoningEffort(runtimeModel.reasoningEffort);
  const promptText = resolveModelPromptText(params);
  const invokeCliFallback = async (): Promise<string> => {
    const cliOutput = await (
      options.invokeCliPrint ?? invokeClaudeCodeCliPrint
    )({
      prompt: promptText,
      // Claude CLI aliases follow the newest model available to the signed-in
      // account. They also avoid coupling fallback execution to retired API
      // snapshot IDs retained in existing conversations.
      model: resolveClaudeCliModel(model),
      appendSystemPrompt: withClaudeCodeSystemPrefix()[0]?.text,
      ...(effort ? { effort } : {}),
    });
    return cliOutput || "No response returned.";
  };
  const refreshCredentials = async () => {
    try {
      return await options.refreshCredentials?.();
    } catch (error) {
      if (!options.allowCliFallback) {
        throw error;
      }
      return undefined;
    }
  };

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
      throw new Error(
        "No reusable Claude Code auth material is available for native execution. Complete `claude auth login` plus `claude setup-token`, or enable the local Claude CLI fallback explicitly.",
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
  let response = await fetch(endpoint, {
    method: "POST",
    headers: anthropicHeaders(accessToken),
    body: JSON.stringify(requestBody),
    signal,
  });

  if (
    (response.status === 401 || response.status === 403) &&
    options.refreshCredentials
  ) {
    const refreshed = await refreshCredentials();
    const refreshedAccessToken = refreshed?.accessToken?.trim();
    if (refreshedAccessToken && refreshedAccessToken !== accessToken) {
      response = await fetch(endpoint, {
        method: "POST",
        headers: anthropicHeaders(refreshedAccessToken),
        body: JSON.stringify(requestBody),
        signal,
      });
    } else if (options.allowCliFallback) {
      return invokeCliFallback();
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
