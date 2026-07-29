import type { GenerateTextParams, IAgentRuntime } from "@elizaos/core";
import {
  DEFAULT_CODEX_BASE_URL,
  DEFAULT_CODEX_INSTRUCTIONS,
  DEFAULT_CODEX_MODEL,
} from "./constants";
import { resolveModelPromptText } from "./prompt-text";
import { getRuntimeModelSettings, getRuntimeProvider } from "./runtime";
import { readCodexResponseText } from "./sse";
import type { CodexPluginOptions } from "./types";

const CODEX_REQUEST_TIMEOUT_MS = 120_000;

interface CodexRequestPayload {
  model: string;
  instructions: string;
  input: Array<{
    role: string;
    content: Array<{
      type: string;
      text: string;
    }>;
  }>;
  stream: boolean;
  store: boolean;
  reasoning?: {
    effort: string;
  };
}

function codexRequestHeaders(credentials: {
  accessToken: string;
  accountId?: string;
}): Record<string, string> {
  return {
    Authorization: `Bearer ${credentials.accessToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    ...(credentials.accountId?.trim()
      ? { "ChatGPT-Account-Id": credentials.accountId.trim() }
      : {}),
  };
}

function codexRequestSignal(params: GenerateTextParams): AbortSignal {
  const callerSignal = (params as GenerateTextParams & { signal?: AbortSignal })
    .signal;
  const timeoutSignal = AbortSignal.timeout(CODEX_REQUEST_TIMEOUT_MS);
  return callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;
}

function createCodexRequestPayload(
  params: GenerateTextParams,
  runtimeModel: { model?: string; reasoningEffort?: string },
): CodexRequestPayload {
  const effort = runtimeModel.reasoningEffort?.trim();
  return {
    model: runtimeModel.model || DEFAULT_CODEX_MODEL,
    instructions: DEFAULT_CODEX_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: resolveModelPromptText(params),
          },
        ],
      },
    ],
    stream: true,
    store: false,
    ...(effort ? { reasoning: { effort } } : {}),
  };
}

export async function runCodexTextGeneration(
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  options: CodexPluginOptions,
): Promise<string> {
  const provider = getRuntimeProvider(runtime);
  if (provider && provider !== "codex") {
    throw new Error(
      `Codex model handler is active, but runtime provider is ${provider}. Restart with the Codex provider selected to use this plugin directly.`,
    );
  }

  let credentials = options.getCredentials?.();
  if (!credentials?.accessToken?.trim() && options.refreshCredentials) {
    credentials = await options.refreshCredentials();
  }
  const accessToken = credentials?.accessToken?.trim();
  if (!accessToken) {
    throw new Error(
      "No reusable linked Codex access token is available for the Codex provider.",
    );
  }

  const runtimeModel = getRuntimeModelSettings(runtime);
  const endpoint = `${runtimeModel.baseUrl || DEFAULT_CODEX_BASE_URL}/responses`;
  const signal = codexRequestSignal(params);
  let response = await fetch(endpoint, {
    method: "POST",
    headers: codexRequestHeaders({
      accessToken,
      accountId: credentials?.accountId,
    }),
    body: JSON.stringify(createCodexRequestPayload(params, runtimeModel)),
    signal,
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
        headers: codexRequestHeaders({
          accessToken: refreshedAccessToken,
          accountId: refreshed?.accountId,
        }),
        body: JSON.stringify(createCodexRequestPayload(params, runtimeModel)),
        signal,
      });
    }
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Codex request failed (${response.status}): ${body}`);
  }

  return readCodexResponseText(response);
}
