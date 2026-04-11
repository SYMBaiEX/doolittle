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
import {
  getRuntimeModelSettings,
  getRuntimeProvider,
} from "./runtime-settings";
import type { ClaudeCodePluginOptions } from "./types";

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
      appendSystemPrompt: withClaudeCodeSystemPrefix()[0]?.text,
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
    headers: anthropicHeaders(accessToken),
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
        headers: anthropicHeaders(refreshedAccessToken),
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
